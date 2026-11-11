import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/public-link.mjs'
const owner='11111111-1111-4111-8111-111111111111'
const respond=(payload)=>new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}})
const empty=()=>new Response(null,{status:204})
test('single-use proposal approval displays scope and records typed acknowledgement',async()=>{
 const before=globalThis.fetch,environment={...process.env}
 process.env.SUPABASE_URL='https://testproject.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret'
 let link=null,patch=null,submissions=[],uses=0
 const record={id:'proposal-1',title:'Website proposal',category:'proposals',client_id:null,project_id:null,payload:{id:'proposal-1',title:'Website proposal',details:'A website with 3 pages',amount:1500,currency:'DKK',dueDate:'2026-11-20',status:'Sent'}}
 globalThis.fetch=async(input,opts={})=>{
  const url=new URL(input)
  if(url.pathname==='/auth/v1/user')return respond({id:owner})
  if(url.pathname.endsWith('/agency_operations')){
    if(opts.method==='PATCH'){patch=JSON.parse(opts.body);return empty()}
    if(opts.method==='POST')return empty()
    return respond([record])
  }
  if(url.pathname.endsWith('/agency_public_links')){
    if(opts.method==='POST'){link=JSON.parse(opts.body);return empty()}
    if(opts.method==='PATCH'){if(uses)return respond([]);uses++;return respond([{id:'link-1'}])}
    return respond([{id:'link-1',owner_id:owner,record_id:'proposal-1',kind:'approval',expires_at:link.expires_at,used_at:uses?new Date().toISOString():null,review_hash:link.review_hash}])
  }
  if(url.pathname.endsWith('/agency_public_submissions')){submissions.push(JSON.parse(opts.body));return empty()}
  if(url.pathname.endsWith('/rpc/agency_submit_public_response')){const body=JSON.parse(opts.body);submissions.push({payload:body.p_response});patch={payload:{status:'Accepted'}};uses++;return respond('Response recorded')}
  if(url.pathname.endsWith('/rpc/agency_external_touch'))return respond(1)
  throw new Error(`Unexpected ${url.pathname}`)
 }
 try{
  const created=await handler(new Request('https://test.netlify.app/.netlify/functions/public-link',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify({recordId:record.id,kind:'approval'})}))
  assert.equal(created.status,200)
  const {url}=await created.json();assert.match(link.review_hash,/^[a-f0-9]{64}$/)
  const preview=await handler(new Request(url));const html=await preview.text()
  assert.match(html,/A website with 3 pages/);assert.match(html,/1500 DKK/)
  const noConsent=await handler(new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Signer',email:'signer@example.com',decision:'approved'})}))
  assert.equal(noConsent.status,400);assert.equal(uses,0)
  const signed=await handler(new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Signer',email:'signer@example.com',decision:'approved',acknowledged:'yes'})}))
  assert.equal(signed.status,200);assert.equal(submissions.length,1)
  assert.equal(submissions[0].payload.acknowledged,true)
  assert.equal(patch.payload.status,'Accepted')
  assert.equal((await handler(new Request(url))).status,410)
 }finally{globalThis.fetch=before;process.env=environment}
})
