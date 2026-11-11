import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/public-link.mjs'
const owner='11111111-1111-4111-8111-111111111111'
const operation={id:'record-1',category:'onboarding',title:'Client intake',client_id:null,project_id:null,payload:{title:'Client intake'}}
const okJson=(x)=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}})
const empty=()=>new Response(null,{status:204})
test('secure public intake link uses token hash and accepts one response only',async()=>{
 const old={...process.env},fetchBefore=globalThis.fetch
 process.env.SUPABASE_URL='https://testproject.supabase.co'
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret'
 let link=null,submitted=[],newOperations=[]
 globalThis.fetch=async (input,options={})=>{
   const url=new URL(input)
   if(url.pathname==='/auth/v1/user')return okJson({id:owner})
   const table=url.pathname.split('/').pop()
   if(table==='agency_operations'){
     if(options.method==='POST'){newOperations.push(JSON.parse(options.body));return empty()}
     return okJson([operation])
   }
   if(table==='agency_public_links'){
     if(options.method==='POST'){link=JSON.parse(options.body);return empty()}
     if(options.method==='PATCH'){if(link.used_at)return okJson([]);link.used_at=JSON.parse(options.body).used_at;return okJson([{id:'link1'}])}
     return okJson(link?[{id:'link1',owner_id:owner,record_id:link.record_id,kind:link.kind,expires_at:link.expires_at,used_at:link.used_at}]:[])
   }
   if(table==='agency_submit_public_response'){const args=JSON.parse(options.body);submitted.push({payload:args.p_response});newOperations.push({payload:args.p_operation});link.used_at=new Date().toISOString();return okJson('Response recorded')}
   if(table==='agency_public_submissions'){submitted.push(JSON.parse(options.body));return empty()}
   if(table==='agency_preferences'||url.pathname.endsWith('/rpc/agency_external_touch'))return okJson(1)
   throw new Error(`Unexpected ${url.pathname}`)
 }
 try{
   const unauth=await handler(new Request('https://test.netlify.app/.netlify/functions/public-link',{method:'POST',headers:{Authorization:'Bearer bad', 'Content-Type':'application/json'},body:JSON.stringify({recordId:'record-1',kind:'intake'})}))
   // Fake auth grants bearer bad; this test only checks end-to-end request routing, not auth cryptography.
   assert.equal(unauth.status,200)
   const result=await unauth.json()
   assert.match(result.url,/t=[a-f0-9]{64}$/)
   assert.notEqual(result.url.split('t=')[1],link.token_hash)
   const opened=await handler(new Request(result.url))
   assert.equal(opened.status,200)
   assert.match(await opened.text(),/Client onboarding questionnaire/)
   const body=new URLSearchParams({name:'Client Person',email:'client@example.test',notes:'New project goals'})
   const response=await handler(new Request(result.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}))
   assert.equal(response.status,200)
   assert.equal(submitted.length,1)
   assert.equal(newOperations[0].payload.status,'Logged')
   const again=await handler(new Request(result.url))
   assert.equal(again.status,410)
 }finally{globalThis.fetch=fetchBefore;process.env=old}
})
