import test from 'node:test'
import assert from 'node:assert/strict'
import {salesInsights,financeInsights,clientPulse,makeProjectTemplatePlan,planOutreachTasks} from '../src/agency-intelligence.ts'
import {emptyWorkspace,defaultClient,defaultProject} from '../src/data.ts'
const ids=(()=>{let i=0;return ()=>`test-id-${++i}`})()
const base=()=>emptyWorkspace()
test('sales funnel forecasts separate currencies and use clear stage probabilities',()=>{
 const w=base();w.leads=[
 {id:'l1',company:'A',stage:'Qualified',currency:'DKK',value:1000,createdAt:'2026-11-06',source:'',email:'',contact:'',followUp:'',notes:''},
 {id:'l2',company:'B',stage:'Negotiation',currency:'EUR',value:200,createdAt:'2026-11-06',source:'',email:'',contact:'',followUp:'',notes:''},
 {id:'l3',company:'C',stage:'Lost',currency:'DKK',value:400,createdAt:'2026-11-06',source:'',email:'',contact:'',followUp:'',notes:'',lostReason:'Too expensive'},
 {id:'l4',company:'D',stage:'Closed Won',currency:'DKK',value:700,createdAt:'2026-11-06',source:'',email:'',contact:'',followUp:'',notes:''}]
 const s=salesInsights(w)
 assert.equal(s.active,2);assert.equal(s.won,1);assert.equal(s.lost,1);assert.equal(s.winRate,50)
 assert.equal(s.forecasts.find(x=>x.currency==='DKK').weighted,300)
 assert.equal(s.forecasts.find(x=>x.currency==='EUR').weighted,160)
 assert.equal(s.reasons[0].reason,'Too expensive')
})
test('finance totals and overdue use original currency without double counting invoices',()=>{
 const w=base();w.transactions=[
 {id:'t1',description:'Income',clientId:'',amount:1000,kind:'Income',status:'Paid',currency:'DKK',date:'2026-11-02',notes:'',createdAt:''},
 {id:'t2',description:'Later income',clientId:'',amount:250,kind:'Income',status:'Pending',currency:'DKK',date:'2026-11-17',notes:'',createdAt:''},
 {id:'t3',description:'Late income',clientId:'',amount:100,kind:'Income',status:'Pending',currency:'DKK',date:'2026-11-01',notes:'',createdAt:''},
 {id:'t4',description:'Expense',clientId:'',amount:200,kind:'Expense',status:'Paid',currency:'DKK',date:'2026-11-06',notes:'',createdAt:''}]
 w.operations=[{id:'op1',category:'invoices',title:'Invoice',clientId:'',projectId:'',status:'Paid',dueDate:'',amount:1000,vatRate:25,currency:'DKK',url:'',details:'',checklist:[],createdAt:'',updatedAt:''}]
 const f=financeInsights(w,'2026-11-06')[0]
 assert.equal(f.net,800);assert.equal(f.outstanding,350);assert.equal(f.overdue,100)
 assert.equal(f.forecast30,250);assert.equal(f.vatEstimated,250)
})
test('template creates one task per new step, preserving existing milestones',()=>{
 const p={...defaultProject('client1'),id:'project1',milestones:[{id:'old',title:'Kickoff',done:false,dueDate:''}]}
 const template={id:'template1',category:'templates',title:'Launch',clientId:'',projectId:'',status:'Active',dueDate:'',amount:null,currency:'DKK',url:'',details:'',checklist:[{id:'a',label:'Kickoff',done:false},{id:'b',label:'QA',done:false}],createdAt:'',updatedAt:''}
 const plan=makeProjectTemplatePlan(p,template,ids,'2026-11-06')
 assert.equal(plan.tasks.length,1);assert.equal(plan.tasks[0].title,'QA');assert.equal(plan.milestones.length,0);assert.equal(plan.deliverables.length,0);assert.equal(makeProjectTemplatePlan(p,template,ids,'2026-11-06',plan.tasks).tasks.length,0)
})
test('outreach cadence generates four deterministic future dates',()=>{
 const tasks=planOutreachTasks('lead1','Example','2026-11-06',ids)
 assert.deepEqual(tasks.map(x=>x.dueDate),['2026-11-06','2026-11-09','2026-11-13','2026-11-20'])
 assert.ok(tasks.every(x=>x.notes.includes('Prospecting lead ID: lead1.')))
})
test('client health score exposes concrete reasons',()=>{
 const w=base();w.clients=[{...defaultClient(),id:'client1',name:'Client One'}]
 w.tasks=[{id:'t',title:'Delayed',clientId:'client1',dueDate:'2026-10-01',priority:'High',done:false,notes:'',createdAt:'2026-09-01'}]
 const pulse=clientPulse(w,'2026-11-06')
 assert.equal(pulse[0].lateTasks,1);assert.equal(pulse[0].risk,2);assert.equal(pulse[0].label,'Monitor')
})
