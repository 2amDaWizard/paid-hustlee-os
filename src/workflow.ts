import type {Workspace,Lead,OperationsRecord,Task} from './types'
import {defaultClient,defaultProject,uid,today} from './data.ts'
import {makeProjectTemplatePlan} from './agency-intelligence.ts'
export function convertLeadWorkspace(w:Workspace,lead:Lead,proposal?:OperationsRecord):Workspace{
  const projectId=lead.convertedProjectId||`lead-project:${lead.id}`
  if((w.projects||[]).some(p=>p.id===projectId))return w
  const explicit=proposal?.clientId?w.clients.find(c=>c.id===proposal.clientId):undefined
  const matches=w.clients.filter(c=>!c.archivedAt&&((lead.email&&c.email?.toLowerCase()===lead.email.toLowerCase())||c.name.trim().toLowerCase()===lead.company.trim().toLowerCase()))
  const existing=explicit||(matches.length===1?matches[0]:undefined)
  const client=existing||{...defaultClient(),id:`lead-client:${lead.id}`,name:lead.company,contact:lead.contact,email:lead.email,phone:lead.phone||'',notes:lead.notes,currency:lead.currency||'DKK'}
  const project={...defaultProject(client.id),id:projectId,name:proposal?.title||lead.services?.join(' + ')||`${lead.company} · Kickoff`,services:lead.services||[],currency:proposal?.currency||lead.currency||'DKK',dealValue:proposal?.amount??lead.value,dealType:proposal?.dealType||'One-off',brief:proposal?.details||lead.notes,nextAction:'Complete onboarding',nextFollowUp:lead.followUp}
  const onboarding:OperationsRecord={id:`onboarding:${projectId}`,category:'onboarding',title:`Onboarding: ${project.name}`,clientId:client.id,projectId,status:'Preparing',dueDate:'',amount:null,currency:project.currency,url:'',details:'Confirm scope, assets and access before starting delivery.',checklist:['Confirm scope and timeline','Collect brief and assets','Confirm access','Schedule kickoff'].map((label,i)=>({id:`onboarding:${projectId}:${i}`,label,done:false})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
  return {...w,clients:existing?w.clients:[client,...w.clients],projects:[project,...(w.projects||[])],leads:w.leads.map(l=>l.id===lead.id?{...l,stage:'Closed Won',convertedClientId:client.id,convertedProjectId:projectId}:l),operations:[...((w.operations||[]).some(r=>r.id===onboarding.id)?[]:[onboarding]),...(w.operations||[]).map(r=>r.leadId===lead.id?{...r,clientId:client.id,projectId}:r)],preferences:{...w.preferences,leadStageHistory:[{leadId:lead.id,from:lead.stage,to:'Closed Won',at:new Date().toISOString()},...(w.preferences.leadStageHistory||[])].slice(0,500)}}
}
export function prepareProposal(w:Workspace,lead:Lead):{workspace:Workspace;id:string}{
  const prior=(w.operations||[]).find(r=>r.category==='proposals'&&r.leadId===lead.id&&!['Declined','Cancelled'].includes(r.status))
  if(prior)return {workspace:w,id:prior.id}
  // A declined/cancelled proposal remains in history. A new attempt must get its
  // own identifier, otherwise it collides with that historical proposal in storage.
  const baseId=`proposal:${lead.id}`
  const existingIds=new Set((w.operations||[]).map(r=>r.id))
  let id=baseId
  if(existingIds.has(id)){
    let attempt=2
    while(existingIds.has(`${baseId}:${attempt}`))attempt++
    id=`${baseId}:${attempt}`
  }
  const op:OperationsRecord={id,category:'proposals',leadId:lead.id,title:`${lead.company} · ${lead.services?.join(' + ')||'Proposal'}`,clientId:lead.convertedClientId||'',projectId:lead.convertedProjectId||'',status:'Draft',amount:lead.value,currency:lead.currency||'DKK',dueDate:'',url:'',details:lead.notes||'',checklist:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
  return {workspace:{...w,operations:[op,...(w.operations||[])]},id}
}
/** Only explicit links drive updates; never infer a payment or erase historical records. */
export function reconcileWorkflow(input:Workspace):Workspace{
  let w=input
  for(const op of w.operations||[]){
    if(op.category==='proposals'&&op.leadId){
      const lead=w.leads.find(l=>l.id===op.leadId)
      if(lead&&op.status==='Accepted')w=convertLeadWorkspace(w,lead,op)
      else if(lead&&op.status==='Sent'&&['Lead','Outreached','Qualified','Meeting Booked'].includes(lead.stage))w={...w,leads:w.leads.map(l=>l.id===lead.id?{...l,stage:'Proposal Sent'}:l)}
    }
    if(op.category==='onboarding'&&op.status==='Completed'&&op.projectId){
      const project=(w.projects||[]).find(p=>p.id===op.projectId)
      if(project?.status==='Onboarding')w={...w,projects:(w.projects||[]).map(p=>p.id===project.id?{...p,status:'In Progress',nextAction:p.nextAction==='Complete onboarding'?'':p.nextAction}:p)}
    }
  }
  const additions:OperationsRecord[]=[]
  for(const op of w.operations||[]){
    if(op.category!=='proposals'||op.status!=='Accepted'||!op.projectId||!op.agreementEnd)continue
    const id=`renewal:${op.id}`
    if((w.operations||[]).some(r=>r.id===id))continue
    additions.push({...op,id,category:'renewals',title:`Renewal: ${op.title}`,status:'Upcoming',dueDate:op.agreementEnd,checklist:[],details:'Review agreement before the recorded end date.'})
  }
  if(additions.length)w={...w,operations:[...additions,...(w.operations||[])]}
  const month=today().slice(0,7)
  const operations=(w.operations||[]).map(r=>{
    if(r.category!=='retainers')return r
    const tasks=w.tasks.filter(t=>t.sourceRecordId===r.id&&t.cycle===month)
    if(!tasks.length)return r
    const checklist=r.checklist.map(s=>{const task=tasks.find(t=>t.sourceStepId===s.id);return task&&task.done!==s.done?{...s,done:task.done}:s})
    if(r.cycle===month&&checklist.every((s,i)=>s===r.checklist[i]))return r
    return {...r,cycle:month,checklist,status:r.cycle!==month&&r.status==='Delivered'?'Planned':r.status}
  })
  return operations.some((r,i)=>r!==(w.operations||[])[i])?{...w,operations}:w
}
export function applyTemplate(w:Workspace,record:OperationsRecord,projectId=record.projectId){
  const project=(w.projects||[]).find(p=>p.id===projectId)
  if(!project)return w
  const plan=makeProjectTemplatePlan(project,record,uid,today(),w.tasks)
  return plan.tasks.length?{...w,tasks:[...plan.tasks,...w.tasks]}:w
}
export function setTaskDone(w:Workspace,id:string,done:boolean):Workspace{
  const task=w.tasks.find(t=>t.id===id)
  const ops=(w.operations||[]).map(r=>r.category!=='templates'&&r.id===task?.sourceRecordId&&(!task.cycle||task.cycle===today().slice(0,7))?{...r,checklist:r.checklist.map(s=>s.id===task.sourceStepId?{...s,done}:s)}:r)
  return {...w,tasks:w.tasks.map(t=>t.id===id?{...t,done}:t),operations:ops}
}
export function setChecklistDone(w:Workspace,record:OperationsRecord,stepId:string,done:boolean):Workspace{
  return {...w,operations:(w.operations||[]).map(r=>r.id===record.id?{...r,checklist:r.checklist.map(s=>s.id===stepId?{...s,done}:s)}:r),tasks:w.tasks.map(t=>record.category!=='templates'&&t.sourceRecordId===record.id&&t.sourceStepId===stepId&&(!t.cycle||t.cycle===today().slice(0,7))?{...t,done}:t)}
}
