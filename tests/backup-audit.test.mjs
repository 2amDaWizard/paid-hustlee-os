import test from 'node:test'
import assert from 'node:assert/strict'
import { auditWorkspaceBackup } from '../src/backup-audit.ts'
const make=()=>({version:1,clients:[{id:'c1',name:'Example A'}],projects:[{id:'p1',clientId:'c1',name:'Campaign',currency:'DKK',dealValue:500}],leads:[],tasks:[],transactions:[],operations:[],activityLog:[],preferences:{agencyName:'PAID HUSTLE',currency:'DKK'}})
test('audit counts and validates client-project relationships',()=>{
  const a=auditWorkspaceBackup(make())
  assert.deepEqual(a.errors,[])
  assert.equal(a.counts.clients,1)
  assert.equal(a.projectValueByCurrency.DKK,500)
})
test('audit blocks duplicate IDs',()=>{
  const data=make(); data.clients.push({id:'c1',name:'Duplicate'})
  assert.match(auditWorkspaceBackup(data).errors.join(' '),/duplicate ID/)
})
test('audit blocks projects referencing missing clients',()=>{
  const data=make();data.projects[0].clientId='missing'
  assert.match(auditWorkspaceBackup(data).errors.join(' '),/missing client/)
})
test('audit blocks tasks linking another client project',()=>{
  const data=make();data.clients.push({id:'c2',name:'Example B'});data.tasks.push({id:'t1',clientId:'c2',projectId:'p1'})
  assert.match(auditWorkspaceBackup(data).errors.join(' '),/another client/)
})
