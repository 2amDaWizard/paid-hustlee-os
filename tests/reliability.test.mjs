import test from 'node:test'
import assert from 'node:assert/strict'
import {activeStatistics,monthlyDeadline} from '../src/agency-rules.ts'
import {emptyWorkspace,defaultClient,defaultProject,defaultLead,defaultTask} from '../src/data.ts'
import {applyAutomations} from '../src/automation-engine.ts'
import {planAgencyActions} from '../netlify/lib/workflow-core.mjs'
import {DAILY_MESSAGES,dailyMessage} from '../src/daily-message.ts'
import {convertLeadWorkspace,prepareProposal,reconcileWorkflow,applyTemplate,setTaskDone,setChecklistDone} from '../src/workflow.ts'
import {mergeWorkspaces} from '../src/workspace-merge.ts'
import {mergeEditedRecord} from '../src/edit-record.ts'
const op=(fields={})=>({id:'r1',category:'retainers',title:'Monthly work',projectId:'p1',clientId:'c1',status:'Planned',dueDate:'2026-01-31',amount:null,currency:'DKK',url:'',details:'',checklist:[{id:'s1',label:'Write copy',done:false}],createdAt:'',updatedAt:'',...fields})
const fixture=()=>({...emptyWorkspace(),clients:[{...defaultClient(),id:'c1'}],projects:[{...defaultProject('c1'),id:'p1',status:'In Progress'}]})
test('active totals exclude inactive, completed, cancelled and archived work; retainer projects count once',()=>{
 const w=fixture();w.projects[0].dealType='Retainer';w.clients.push({...defaultClient(),id:'c2'},{...defaultClient(),id:'c3',archivedAt:'2026-01-01'})
 for(const [i,status] of ['Completed','Cancelled','Inactive','Archived','On hold'].entries())w.projects.push({...defaultProject('c2'),id:`inactive${i}`,status})
 w.projects.push({...defaultProject('c1'),id:'archived',archivedAt:'2026-01-01'},{...defaultProject('c3'),id:'archived-client'})
 assert.deepEqual(activeStatistics(w),{clients:1,projects:1,retainers:1})
})
test('monthly dates clamp month ends and leap years; browser and scheduled planners agree and do not duplicate manual runs',()=>{
 assert.equal(monthlyDeadline('2026-01-31','2026-02-01'),'2026-02-28');assert.equal(monthlyDeadline('2028-01-31','2028-02-01'),'2028-02-29');assert.equal(monthlyDeadline('','2026-04-01'),'2026-04-30')
 const w=fixture();w.operations=[op()]
 const first=applyAutomations(w,'2026-02-01').workspace;assert.equal(first.tasks[0].dueDate,'2026-02-28')
 const server=planAgencyActions({...w,existingTaskIds:[]},'2026-02-01');assert.deepEqual(server.tasks,first.tasks)
 assert.equal(applyAutomations(first,'2026-02-01').workspace.tasks.length,1)
 const next=applyAutomations(first,'2026-03-01').workspace;assert.equal(next.tasks[0].dueDate,'2026-03-31');assert.equal(next.tasks.length,2)
 w.tasks=[{...defaultTask(),id:'generated-r1-2026-02-s1'}];assert.equal(applyAutomations(w,'2026-02-01').workspace.tasks.length,1)
 w.projects[0].status='Cancelled';assert.equal(applyAutomations({...w,tasks:[]},'2026-02-01').workspace.tasks.length,0)
})
test('invoice reminders are absent even when legacy overdue rule is enabled',()=>{
 const w=fixture();w.preferences.automations={enabled:{'overdue-invoice':true}};w.operations=[op({category:'invoices',status:'Part-paid',dueDate:'2026-01-01'})]
 assert.equal(applyAutomations(w,'2026-02-01').workspace.tasks.length,0)
})
test('daily messages rotate for ninety days without repeating and are stable within a calendar date',()=>{
 assert.equal(DAILY_MESSAGES.length,90);assert.equal(new Set(DAILY_MESSAGES).size,90)
 const results=Array.from({length:90},(_,i)=>dailyMessage(new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10)))
 assert.equal(new Set(results).size,90);assert.equal(dailyMessage('2026-11-11'),dailyMessage('2026-11-11'))
})
test('conversion and accepted proposal reconciliation are idempotent and preserve existing client and finance records',()=>{
 let w=fixture();const lead={...defaultLead(),id:'lead1',company:'Example',email:'owner@example.test',value:1000};w.leads=[lead]
 const prepared=prepareProposal(w,lead);w=prepared.workspace;w.operations[0]={...w.operations[0],status:'Accepted',agreementEnd:'2027-01-01',dealType:'Retainer'}
 w=reconcileWorkflow(w);const again=reconcileWorkflow(w)
 assert.equal(w.clients.length,2);assert.equal(w.projects.length,2);assert.equal(w.operations.filter(r=>r.category==='onboarding').length,1);assert.equal(w.operations.filter(r=>r.category==='renewals').length,1);assert.equal(w.transactions.length,0)
 assert.deepEqual(again,w);assert.deepEqual(convertLeadWorkspace(w,w.leads[0]),w)
 const onboard=w.operations.find(r=>r.category==='onboarding');w.operations=w.operations.map(r=>r.id===onboard.id?{...r,status:'Completed'}:r)
 assert.equal(reconcileWorkflow(w).projects.find(p=>p.id===onboard.projectId).status,'In Progress')
})
test('preparing another proposal after decline or cancellation never reuses a historical record ID',()=>{
 let w=fixture();const lead={...defaultLead(),id:'repeat-lead',company:'Example'};w.leads=[lead]
 const first=prepareProposal(w,lead);w=first.workspace
 assert.equal(first.id,'proposal:repeat-lead')
 w.operations[0]={...w.operations[0],status:'Declined'}
 const second=prepareProposal(w,lead);w=second.workspace
 assert.equal(second.id,'proposal:repeat-lead:2')
 assert.equal(new Set(w.operations.map(r=>r.id)).size,w.operations.length)
 const same=prepareProposal(w,lead)
 assert.equal(same.id,second.id)
 assert.equal(same.workspace.operations.length,2)
 w.operations[0]={...w.operations[0],status:'Cancelled'}
 const third=prepareProposal(w,lead)
 assert.equal(third.id,'proposal:repeat-lead:3')
 assert.equal(new Set(third.workspace.operations.map(r=>r.id)).size,3)
})
test('template entry points share deterministic task IDs and checklist completion updates both ways',()=>{
 let w=fixture();const record=op({category:'templates'});w.operations=[record];w=applyTemplate(w,record);w=applyTemplate(w,record)
 assert.equal(w.tasks.length,1);assert.equal(w.projects[0].deliverables.length,0);assert.equal(w.projects[0].milestones.length,0)
 w=setTaskDone(w,w.tasks[0].id,true);assert.equal(w.operations[0].checklist[0].done,false) // Reusable templates do not share completion across projects.
 w.operations[0].category='retainers';w=setTaskDone(w,w.tasks[0].id,true);assert.equal(w.operations[0].checklist[0].done,true)
 w=setChecklistDone(w,w.operations[0],'s1',false);assert.equal(w.tasks[0].done,false)
})
test('merge protects remote deletions, preserves independent additions and requires decisions for delete/edit collisions',()=>{
 const b=fixture();b.tasks=[{...defaultTask(),id:'t1',title:'Before'}];const l=structuredClone(b),r=structuredClone(b)
 l.tasks[0].title='Local';r.tasks=[]
 const merged=mergeWorkspaces(b,l,r);assert.equal(merged.conflicts.length,1)
 assert.equal(mergeWorkspaces(b,l,r,{[merged.conflicts[0].path]:'remote'}).workspace.tasks.length,0)
 r.tasks=[...b.tasks,{...defaultTask(),id:'new'}];assert.equal(mergeWorkspaces(b,l,r).workspace.tasks.length,2)
})
test('open form merges unrelated remote changes and blocks same-field overwrites',()=>{
 const original={id:'1',name:'Before',notes:'Old'},edited={...original,name:'Local'}
 assert.deepEqual(mergeEditedRecord(original,edited,{...original,notes:'Remote'}),{id:'1',name:'Local',notes:'Remote'})
 assert.throws(()=>mergeEditedRecord(original,edited,{...original,name:'Remote'}),/changed elsewhere/)
})

test('JSONB key reordering does not create false nested-array conflicts',()=>{
 const b=fixture(),l=structuredClone(b),r=structuredClone(b)
 l.projects[0].milestones=[{id:'m',title:'Done',done:true,dueDate:''}]
 r.projects[0].milestones=[{dueDate:'',done:true,title:'Done',id:'m'}]
 assert.equal(mergeWorkspaces(b,l,r).conflicts.length,0)
})
