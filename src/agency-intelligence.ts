import {isActiveProject} from './agency-rules.ts'
import type { Workspace, Project, OperationsRecord, Task, Currency } from './types'

export const STAGE_ODDS: Record<string,number> = {
  Lead:.1,Outreached:.15,Qualified:.3,'Meeting Booked':.45,'Proposal Sent':.65,Negotiation:.8,'Closed Won':1,Lost:0
}
const cents = (n:number) => Math.round((n+Number.EPSILON)*100)/100
export const isCalendarDay = (d:string) => /^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(`${d}T12:00:00Z`))
export const daysUntil = (date:string,now:string) => isCalendarDay(date)?Math.round((Date.parse(`${date}T12:00:00Z`)-Date.parse(`${now}T12:00:00Z`))/86400000):null

export interface DealForecast {currency:Currency; pipeline:number; weighted:number; won:number; lost:number; retainerMonthly:number}
export interface SalesInsights {active:number;won:number;lost:number;winRate:number|null;reasons:{reason:string;count:number}[];stages:{stage:string;count:number;value:number}[];forecasts:DealForecast[]}
export function salesInsights(workspace:Workspace):SalesInsights {
  const live=workspace.leads.filter(l=>!['Closed Won','Lost'].includes(l.stage))
  const won=workspace.leads.filter(l=>l.stage==='Closed Won').length
  const lost=workspace.leads.filter(l=>l.stage==='Lost').length
  const reasons=new Map<string,number>()
  const stages=new Map<string,{count:number;value:number}>()
  const forecasts=new Map<Currency,DealForecast>()
  const forecast=(currency:Currency)=>{
    if(!forecasts.has(currency))forecasts.set(currency,{currency,pipeline:0,weighted:0,won:0,lost:0,retainerMonthly:0})
    return forecasts.get(currency)!
  }
  for(const lead of workspace.leads){
    const value=Number.isFinite(lead.value)?Math.max(0,lead.value||0):0
    const currency=lead.currency||'DKK'
    const row=stages.get(lead.stage)||{count:0,value:0}
    row.count++;row.value=cents(row.value+value);stages.set(lead.stage,row)
    if(lead.stage==='Lost'){const reason=(lead.lostReason||'Not recorded').trim()||'Not recorded';reasons.set(reason,(reasons.get(reason)||0)+1);forecast(currency).lost+=value}
    else if(lead.stage==='Closed Won') forecast(currency).won+=value
    else {forecast(currency).pipeline+=value;forecast(currency).weighted+=value*(STAGE_ODDS[lead.stage]??.25)}
  }
  for(const project of workspace.projects||[])if(isActiveProject(project)&&project.dealType==='Retainer'&&project.dealValue!=null)forecast(project.currency||'DKK').retainerMonthly+=Math.max(0,project.dealValue)
  return {active:live.length,won,lost,winRate:won+lost?Math.round(100*won/(won+lost)):null,reasons:[...reasons].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),stages:[...stages].map(([stage,row])=>({stage,...row})),forecasts:[...forecasts.values()].map(row=>({...row,pipeline:cents(row.pipeline),weighted:cents(row.weighted),retainerMonthly:cents(row.retainerMonthly)}))}
}
export interface FinanceInsights {currency:Currency;collected:number;outstanding:number;overdue:number;expenses:number;net:number;vatEstimated:number;forecast30:number;forecast90:number}
export function financeInsights(workspace:Workspace,now:string):FinanceInsights[] {
  const rows=new Map<Currency,FinanceInsights>()
  const get=(currency:Currency)=>{if(!rows.has(currency))rows.set(currency,{currency,collected:0,outstanding:0,overdue:0,expenses:0,net:0,vatEstimated:0,forecast30:0,forecast90:0});return rows.get(currency)!}
  for(const tx of workspace.transactions){
    const row=get(tx.currency||'DKK');const amount=Math.max(0,Number(tx.amount)||0)
    if(tx.kind==='Expense'){if(tx.status==='Paid')row.expenses+=amount;continue}
    if(tx.status==='Paid')row.collected+=amount
    if(tx.status==='Pending'){
      row.outstanding+=amount
      if(tx.date&&tx.date<now)row.overdue+=amount
      const remaining=daysUntil(tx.date,now)
      if(remaining!==null&&remaining>=0&&remaining<=30)row.forecast30+=amount
      if(remaining!==null&&remaining>=0&&remaining<=90)row.forecast90+=amount
    }
  }
  // Invoice VAT estimate is calculated only from explicit per-invoice VAT rates.
  for(const op of workspace.operations||[])if(op.category==='invoices'&&op.status==='Paid'&&op.amount!=null&&op.vatRate!=null){
    const rate=Number(op.vatRate)
    if(rate>=0&&rate<=100)get(op.currency||'DKK').vatEstimated+=op.amount*rate/100
  }
  return [...rows.values()].map(row=>Object.fromEntries(Object.entries({...row,net:row.collected-row.expenses}).map(([key,value])=>[key,typeof value==='number'?cents(value):value])) as unknown as FinanceInsights)
}

export function clientPulse(workspace:Workspace,now:string){
  return workspace.clients.filter(c=>!c.archivedAt).map(client=>{
    const projects=(workspace.projects||[]).filter(p=>!p.archivedAt&&p.clientId===client.id)
    const openTasks=workspace.tasks.filter(t=>t.clientId===client.id&&!t.done)
    const lateTasks=openTasks.filter(t=>t.dueDate&&t.dueDate<now)
    const lateProjects=projects.filter(p=>p.deadline&&p.deadline<now&&p.status!=='Completed')
    const pending=workspace.transactions.filter(t=>t.clientId===client.id&&t.kind==='Income'&&t.status==='Pending'&&!!t.date&&t.date<now).length
    const followup=projects.some(p=>p.nextFollowUp&&p.nextFollowUp<=now)||(client.nextFollowUp&&client.nextFollowUp<=now)
    const risk=lateTasks.length*2+lateProjects.length*3+pending+Number(!!followup)
    return {id:client.id,name:client.name,risk,label:risk>=5?'Needs attention':risk>0?'Monitor':'Healthy',lateTasks:lateTasks.length,lateProjects:lateProjects.length,pending,followup:Boolean(followup)}
  }).sort((a,b)=>b.risk-a.risk||a.name.localeCompare(b.name))
}
export type TemplatePlan = {tasks:Task[];milestones:{id:string;title:string;done:boolean;dueDate:string}[];deliverables:{id:string;title:string;status:'To do';dueDate:string}[]}
export function makeProjectTemplatePlan(project:Project,template:OperationsRecord,makeId:()=>string,now:string,existingTasks:Task[]=[]):TemplatePlan {
  if(template.category!=='templates')throw new Error('Only template records can be applied to a project')
  if(!project.id||!project.clientId)throw new Error('Template requires a project linked to a client')
  const existing=new Set([...project.milestones,...project.deliverables,...existingTasks.filter(t=>t.projectId===project.id)].map(step=>step.title.trim().toLowerCase()))
  const tasks:Task[]=[],milestones:TemplatePlan['milestones']=[],deliverables:TemplatePlan['deliverables']=[]
  for(const step of template.checklist||[]){
    const title=step.label.trim();if(!title||existing.has(title.toLowerCase()))continue
    existing.add(title.toLowerCase())
    tasks.push({id:`template:${template.id}:${project.id}:${step.id}`,sourceRecordId:template.id,sourceStepId:step.id,title,clientId:project.clientId,projectId:project.id,dueDate:project.deadline||'',priority:project.priority,done:false,notes:`Project template: ${template.title}`,createdAt:now,subtasks:[]})
  }
  return {tasks,milestones,deliverables}
}

export type OutreachCadence={day:number;channel:string;subject:string;action:string}
export const OUTREACH_CADENCE:OutreachCadence[]=[
  {day:0,channel:'Email',subject:'Personalized first touch',action:'Research the company and send a relevant introductory message'},
  {day:3,channel:'Email',subject:'Value-led follow-up',action:'Share one useful insight or suggestion, not a generic bump'},
  {day:7,channel:'Phone or LinkedIn',subject:'Alternative-channel check-in',action:'Reach out via a second appropriate channel, respecting opt-outs'},
  {day:14,channel:'Email',subject:'Close the loop',action:'Send a final courteous message and stop this sequence if there is no reply'},
]
export function planOutreachTasks(leadId:string,company:string,start:string,makeId:()=>string):Task[]{
  if(!isCalendarDay(start))throw new Error('Choose a valid start date')
  const origin=Date.parse(`${start}T12:00:00Z`)
  return OUTREACH_CADENCE.map(item=>({id:makeId(),title:`${item.subject}: ${company}`,clientId:'',projectId:'',dueDate:new Date(origin+item.day*86400000).toISOString().slice(0,10),priority:'Medium',done:false,notes:`Prospecting lead ID: ${leadId}. ${item.channel}. ${item.action}. Manually review consent and preferences; never auto-send unsolicited email.`,createdAt:start,subtasks:[]}))
}
