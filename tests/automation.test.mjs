import test from 'node:test'
import assert from 'node:assert/strict'
import {applyAutomations,AUTOMATION_KINDS} from '../src/automation-engine.ts'
const empty=()=>({version:1,clients:[],projects:[],leads:[],tasks:[],transactions:[],operations:[],activityLog:[],preferences:{currency:'DKK',agencyName:'TEST'}})
test('every automation has unique identifier',()=>assert.equal(new Set(AUTOMATION_KINDS.map(r=>r.id)).size,6))
test('due lead and project generate tasks once',()=>{
 const a=empty();a.leads=[{id:'lead1',company:'Acme',stage:'Lead',followUp:'2026-11-06'}]
 a.clients=[{id:'client1',name:'Client'}]
 a.projects=[{id:'proj1',clientId:'client1',name:'Website',status:'In Progress',nextFollowUp:'2026-11-05'}]
 const first=applyAutomations(a,'2026-11-06')
 assert.equal(first.descriptions.length,2)
 assert.equal(first.workspace.tasks.length,2)
 const second=applyAutomations(first.workspace,'2026-11-06')
 assert.equal(second.descriptions.length,0)
 assert.equal(second.workspace,first.workspace)
})
test('disabled rules do not generate actions',()=>{
 const a=empty();a.preferences.automations={enabled:{'due-lead':false}}
 a.leads=[{id:'L',company:'B',stage:'Lead',followUp:'2026-11-06'}]
 assert.equal(applyAutomations(a,'2026-11-06').descriptions.length,0)
})
test('monthly retainer tasks are generated once per month',()=>{
 let a=empty();a.clients=[{id:'C'}];a.projects=[{id:'P',clientId:'C',name:'Ads',status:'Active Retainer'}]
 a.operations=[{id:'R',category:'retainers',title:'Monthly ads',projectId:'P',status:'In progress',checklist:[{id:'S',label:'Ad report',done:false}]}]
 a=applyAutomations(a,'2026-11-06').workspace
 assert.equal(a.tasks.length,1)
 a=applyAutomations(a,'2026-11-08').workspace
 assert.equal(a.tasks.length,1)
 a=applyAutomations(a,'2026-12-01').workspace
 assert.equal(a.tasks.length,2)
})
test('completed project generates one handover record',()=>{
 const a=empty();a.projects=[{id:'P',clientId:'C',name:'Site',status:'Completed'}]
 const out=applyAutomations(a,'2026-11-06').workspace
 assert.equal(out.operations[0].category,'handovers')
 assert.equal(out.operations[0].checklist.length,4)
})
test('invalid date rejected',()=>assert.throws(()=>applyAutomations(empty(),'yesterday'),/Invalid ISO date/))
