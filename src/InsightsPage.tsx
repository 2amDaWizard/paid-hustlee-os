import { useMemo,useState } from 'react'
import type { Dispatch,SetStateAction } from 'react'
import { BarChart3,CalendarClock,Check,ClipboardCheck,HeartHandshake,Plus,TrendingUp,Wallet,Workflow } from 'lucide-react'
import type { Workspace } from './types'
import {uid,today,formatMoney} from './data'
import {applyTemplate as applyWorkspaceTemplate} from './workflow'
import {salesInsights,financeInsights,clientPulse,makeProjectTemplatePlan,planOutreachTasks,OUTREACH_CADENCE} from './agency-intelligence'

type Section='sales'|'finance'|'clients'|'delivery'|'outreach'
export default function InsightsPage({data,setData,onClient,onLead,onProject}: {
  data:Workspace; setData:Dispatch<SetStateAction<Workspace>>;
  onClient:(id:string)=>void; onLead:(id:string)=>void; onProject:(id:string)=>void
}) {
  const [section,setSection]=useState<Section>('sales')
  const [message,setMessage]=useState('')
  const [chosenProject,setChosenProject]=useState('')
  const [chosenTemplate,setChosenTemplate]=useState('')
  const [chosenLead,setChosenLead]=useState('')
  const [startDate,setStartDate]=useState(today())
  const sales=useMemo(()=>salesInsights(data),[data])
  const finance=useMemo(()=>financeInsights(data,today()),[data])
  const pulse=useMemo(()=>clientPulse(data,today()),[data])
  const templates=(data.operations||[]).filter(op=>op.category==='templates'&&op.status!=='Archived')
  const activeProjects=(data.projects||[]).filter(p=>!p.archivedAt)
  const deliveryTotal=data.tasks.length
  const deliveryDone=data.tasks.filter(t=>t.done).length
  const applyTemplate=()=>{
    const project=activeProjects.find(p=>p.id===chosenProject),template=templates.find(t=>t.id===chosenTemplate)
    if(!project||!template){setMessage('Choose a project and a template.');return}
    const next=applyWorkspaceTemplate(data,template,project.id)
    setData(prev=>applyWorkspaceTemplate(prev,template,project.id))
    setMessage(next.tasks.length===data.tasks.length?'These steps are already tracked. No duplicates added.':`Added ${next.tasks.length-data.tasks.length} tasks to ${project.name}.`)
  }
  const launchOutreach=()=>{
    const lead=data.leads.find(l=>l.id===chosenLead)
    if(!lead){setMessage('Select a prospect first.');return}
    const marker=`Prospecting lead ID: ${lead.id}.`
    if(data.tasks.some(t=>t.notes?.includes(marker))){setMessage('This lead already has an outreach sequence. Edit existing tasks or finish them first.');return}
    try{
      const tasks=planOutreachTasks(lead.id,lead.company,startDate,uid)
      setData(prev=>({...prev,tasks:[...tasks,...prev.tasks],leads:prev.leads.map(l=>l.id===lead.id?{...l,stage:l.stage==='Lead'?'Outreached':l.stage,followUp:tasks[1].dueDate,lastContact:startDate}:l),preferences:{...prev.preferences,leadStageHistory:lead.stage==='Lead'?[{leadId:lead.id,from:'Lead',to:'Outreached',at:new Date().toISOString()},...(prev.preferences.leadStageHistory||[])].slice(0,500):prev.preferences.leadStageHistory},activityLog:[{id:uid(),date:new Date().toISOString(),label:`Planned four outreach touches for ${lead.company}`},...(prev.activityLog||[])].slice(0,250)}))
      setMessage(`Created four personalized outreach tasks for ${lead.company}. No messages have been sent.`)
    }catch(e){setMessage(e instanceof Error?e.message:'Could not plan outreach')}
  }
  const format=(value:number,currency:'DKK'|'EUR'|'USD')=>formatMoney(value,currency)
  return <div className="content-page">
    <div className="page-heading"><div><div className="eyebrow">GROWTH CONTROL</div><h1>Agency Intelligence</h1><p>Sales funnel, cash-flow forecast, client health, delivery capacity and actionable prospecting.</p></div></div>
    <div className="insight-tabs" role="tablist" aria-label="Agency intelligence sections">{([
      ['sales','Sales funnel'],['finance','Cash forecast'],['clients','Client health'],['delivery','Delivery & templates'],['outreach','Outreach planner']
    ] as const).map(([key,label])=><button key={key} role="tab" aria-selected={section===key} className={`btn btn-subtle ${section===key?'selected':''}`} onClick={()=>{setSection(key);setMessage('')}}>{label}</button>)}</div>
    {message&&<div className="insight-message" role="status"><Check size={15}/>{message}</div>}
    {section==='sales'&&<>
      <div className="insight-cards"><div className="panel insight-card"><TrendingUp size={22}/><span>Active prospects</span><strong>{sales.active}</strong></div><div className="panel insight-card"><Check size={22}/><span>Closed won</span><strong>{sales.won}</strong></div><div className="panel insight-card"><BarChart3 size={22}/><span>Closed-deal win rate</span><strong>{sales.winRate===null?'No data':`${sales.winRate}%`}</strong></div><div className="panel insight-card"><Workflow size={22}/><span>Lost deals</span><strong>{sales.lost}</strong></div></div>
      <div className="insight-split"><section className="panel insight-section"><h2>Pipeline by stage</h2><p>Unconverted lead values are indicative, not guaranteed revenue.</p>{sales.stages.length?sales.stages.map(row=><div key={row.stage} className="insight-line"><span>{row.stage}</span><b>{row.count} deal{row.count===1?'':'s'}</b></div>):<p>No prospects yet. Add your first lead in Sales pipeline.</p>}</section>
      <section className="panel insight-section"><h2>Loss reasons</h2><p>Use recorded outcomes to improve your offer and follow-ups.</p>{sales.reasons.length?sales.reasons.map(row=><div className="insight-line" key={row.reason}><span>{row.reason}</span><b>{row.count}</b></div>):<p>No lost deal reasons recorded yet.</p>}</section></div>
      <section className="panel insight-section"><h2>Recent stage movements</h2><p>Captures edits and board movements made from this version onward. Earlier changes were not recorded historically.</p>{data.preferences.leadStageHistory?.length?data.preferences.leadStageHistory.slice(0,12).map((move,i)=><div className="insight-line" key={`${move.leadId}:${move.at}:${i}`}><span>{data.leads.find(l=>l.id===move.leadId)?.company||'Past lead'}: {move.from} → {move.to}</span><b>{new Date(move.at).toLocaleDateString('en-GB')}</b></div>):<p>No tracked lead stage changes yet.</p>}</section>
      <section className="panel insight-section"><h2>Estimated weighted pipeline by currency</h2><p>Indicative probabilities: Lead 10%, Outreached 15%, Qualified 30%, Meeting 45%, Proposal 65%, Negotiation 80%. Custom stages 25%. These are assumptions, not historical conversion rates.</p>{sales.forecasts.length?sales.forecasts.map(row=><div key={row.currency} className="insight-line"><span><b>{row.currency}</b> · pipeline {format(row.pipeline,row.currency)} · retainer/month {format(row.retainerMonthly,row.currency)}</span><strong>Weighted: {format(row.weighted,row.currency)}</strong></div>):<p>Add leads with deal values to see your forecast.</p>}</section>
    </>}
    {section==='finance'&&<>
      <section className="panel insight-section"><h2>Cash flow and invoice aging</h2><p>Recorded transactions grouped by their original currency. No unreliable conversion is applied. Pending transaction dates are used as expected dates.</p>{finance.length?finance.map(row=><div className="insight-finance" key={row.currency}><h3>{row.currency}</h3><div className="insight-cards"><div><span>Gross collections</span><strong>{format(row.collected,row.currency)}</strong></div><div><span>Outstanding</span><strong>{format(row.outstanding,row.currency)}</strong></div><div><span>Overdue</span><strong>{format(row.overdue,row.currency)}</strong></div><div><span>Net cash flow</span><strong>{format(row.net,row.currency)}</strong></div><div><span>Expected next 30 days</span><strong>{format(row.forecast30,row.currency)}</strong></div><div><span>Expected next 90 days</span><strong>{format(row.forecast90,row.currency)}</strong></div><div><span>Estimated invoice VAT*</span><strong>{format(row.vatEstimated,row.currency)}</strong></div></div></div>):<p>No transactions yet. Start recording income and expenses in Finances.</p>}<p className="setting-hint">* VAT estimate uses only paid invoice records that have an explicitly entered VAT rate. It is not a tax return and does not reconcile invoice records against transaction records.</p></section>
    </>}
    {section==='clients'&&<section className="panel insight-section"><h2>Client retention signals</h2><p>Transparent alerts based on overdue tasks, projects, pending payments and follow-ups. No black-box AI scoring.</p>{pulse.length?pulse.map(row=><button className="insight-person" key={row.id} onClick={()=>onClient(row.id)}><HeartHandshake size={19}/><span><strong>{row.name}</strong><small>{row.lateTasks} overdue tasks · {row.lateProjects} overdue projects · {row.pending} pending payments · {row.followup?'Follow-up due':'Follow-up current'}</small></span><b className={row.risk>=5?'insight-urgent':''}>{row.label}</b></button>):<p>Add a client to start health monitoring.</p>}</section>}
    {section==='delivery'&&<>
      <div className="insight-cards"><div className="panel insight-card"><ClipboardCheck size={22}/><span>Tasks finished</span><strong>{deliveryDone} / {deliveryTotal}</strong></div><div className="panel insight-card"><CalendarClock size={22}/><span>Due or overdue</span><strong>{data.tasks.filter(t=>!t.done&&t.dueDate&&t.dueDate<=today()).length}</strong></div><div className="panel insight-card"><Wallet size={22}/><span>Active retainers</span><strong>{activeProjects.filter(p=>p.dealType==='Retainer'&&p.status!=='Completed').length}</strong></div></div>
      <section className="panel insight-section"><h2>Apply project checklist</h2><p>Create one actionable task per checklist step. Existing tasks, milestones and deliverables are checked to avoid duplicates.</p><div className="insight-form"><label>Project<select value={chosenProject} onChange={e=>setChosenProject(e.target.value)}><option value="">Choose a project</option>{activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Project template<select value={chosenTemplate} onChange={e=>setChosenTemplate(e.target.value)}><option value="">Choose a template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.title} ({t.checklist.length} steps)</option>)}</select></label><button className="btn btn-primary" onClick={applyTemplate} disabled={!chosenProject||!chosenTemplate}><Plus size={15}/>Apply template</button></div><p className="setting-hint">Create or edit reusable templates under Agency operations → Project templates.</p></section>
      <section className="panel insight-section"><h2>Project progress</h2>{activeProjects.length?activeProjects.map(project=>{const tasks=data.tasks.filter(t=>t.projectId===project.id);const done=tasks.filter(t=>t.done).length;return <button className="insight-person" key={project.id} onClick={()=>onProject(project.id)}><ClipboardCheck size={18}/><span><strong>{project.name}</strong><small>{project.status} · {project.milestones.filter(x=>x.done).length}/{project.milestones.length} milestones · {project.deliverables.filter(x=>x.status==='Approved').length}/{project.deliverables.length} approvals</small></span><b>{tasks.length?Math.round(100*done/tasks.length):0}% tasks</b></button>}):<p>No active projects.</p>}</section>
    </>}
    {section==='outreach'&&<section className="panel insight-section"><h2>Responsible outreach cadence</h2><p>Plan four manually reviewed prospecting touches. The OS creates tasks and updates follow-up dates, but never sends unsolicited messages for you.</p><div className="insight-form"><label>Prospect<select value={chosenLead} onChange={e=>setChosenLead(e.target.value)}><option value="">Choose a lead</option>{data.leads.filter(l=>!['Lost','Closed Won'].includes(l.stage)).map(l=><option value={l.id} key={l.id}>{l.company}</option>)}</select></label><label>Start date<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><button className="btn btn-primary" onClick={launchOutreach} disabled={!chosenLead||!startDate}><Plus size={15}/>Create outreach tasks</button></div><div className="insight-cadence">{OUTREACH_CADENCE.map(t=><div key={t.day}><b>Day {t.day} · {t.channel}</b><strong>{t.subject}</strong><span>{t.action}</span></div>)}</div>{chosenLead&&<button className="btn btn-subtle btn-sm" onClick={()=>onLead(chosenLead)}>Open prospect record</button>}</section>}
  </div>
}
