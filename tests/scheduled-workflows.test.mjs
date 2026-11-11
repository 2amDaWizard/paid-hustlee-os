import test from 'node:test'
import assert from 'node:assert/strict'
import {planAgencyActions} from '../netlify/lib/workflow-core.mjs'
const day='2026-11-09'
test('server planner generates internal automation actions and no duplicates',()=>{
 const records={leads:[{id:'lead1',company:'Example',stage:'Qualified',followUp:'2026-11-08'}],projects:[{id:'proj1',clientId:'client1',name:'Project',status:'Completed'}],operations:[],preferences:{}}
 const plan=planAgencyActions(records,day)
 assert.ok(plan.tasks.some(x=>x.id==='auto:lead:lead1:2026-11-08'))
 assert.ok(plan.operations.some(x=>x.id==='auto:handover:proj1'))
 assert.ok(plan.operations.some(x=>x.id==='auto:weekly:2026-11-09'))
 const again=planAgencyActions({...records,existingTaskIds:plan.tasks.map(t=>t.id),existingOpsIds:plan.operations.map(o=>o.id)},day)
 assert.equal(again.tasks.length,0);assert.equal(again.operations.length,0)
})
test('server planner respects disabled rules and does not invent payment receipts',()=>{
 const plan=planAgencyActions({leads:[{id:'one',company:'Example',stage:'Qualified',followUp:'2026-11-08'}],projects:[],operations:[{id:'inv',category:'invoices',title:'Invoice',dueDate:'2026-11-08',status:'Sent'}],preferences:{automations:{enabled:{'due-lead':false,'overdue-invoice':false}}}},day)
 assert.ok(plan.tasks.every(x=>!x.id.includes('invoice:')&&!x.id.includes('lead:')))
 assert.equal(plan.operations.filter(op=>op.category==='invoices').length,0)
})
