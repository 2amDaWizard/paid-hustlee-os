import test from 'node:test'
import assert from 'node:assert/strict'
import {diffWorkspace} from '../src/relational.ts'
const empty=()=>({version:1,clients:[],projects:[],leads:[],tasks:[],transactions:[],operations:[],activityLog:[],preferences:{currency:'DKK',agencyName:'PAID HUSTLE'}})
test('no patch for unchanged workspace',()=>{
  const s=empty();assert.equal(diffWorkspace(s,structuredClone(s)),null)
})
test('inserts just one client without replacing unrelated records',()=>{
  const prev=empty();const next=structuredClone(prev)
  next.clients.push({id:'client-1',name:'Test Client'})
  assert.deepEqual(diffWorkspace(prev,next),{clients:{upsert:[{id:'client-1',name:'Test Client'}],delete:[]}})
})
test('updates just one task and deletes another',()=>{
  const prev=empty();prev.tasks=[{id:'t1',title:'One',done:false},{id:'t2',title:'Two',done:false}]
  const next=structuredClone(prev);next.tasks=[{id:'t1',title:'One',done:true}]
  assert.deepEqual(diffWorkspace(prev,next),{tasks:{upsert:[{id:'t1',title:'One',done:true}],delete:['t2']}})
})
test('ignores array order but detects preference edits',()=>{
  const prev=empty();prev.clients=[{id:'a',name:'A'},{id:'b',name:'B'}]
  const next=structuredClone(prev);next.clients.reverse();next.preferences.currency='EUR'
  assert.deepEqual(diffWorkspace(prev,next),{preferences:next.preferences})
})
test('never deletes records from absent legacy arrays',()=>{
  const prev=empty();delete prev.projects;const next=structuredClone(prev);next.projects=[{id:'p1',name:'Example'}]
  assert.deepEqual(diffWorkspace(prev,next),{projects:{upsert:[{id:'p1',name:'Example'}],delete:[]}})
})
