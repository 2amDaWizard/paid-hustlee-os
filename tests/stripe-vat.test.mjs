import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import checkout from '../netlify/functions/stripe-checkout.mjs'
import webhook from '../netlify/functions/stripe-webhook.mjs'
const owner='11111111-1111-4111-8111-111111111111'
const invoice={id:'invoice-1',category:'invoices',title:'Test invoice',status:'Sent',amount:1000,vatRate:25,currency:'DKK',details:'Website setup'}
const savedRecord={id:'invoice-1',category:'invoices',title:'Test invoice',client_id:null,project_id:null,payload:invoice}
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}})
const empty=()=>new Response(null,{status:204})
test('Stripe uses VAT-inclusive Checkout cents and reconciles webhook to gross paid transaction',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env},sent=[]
 process.env.SUPABASE_URL='https://testproject.supabase.co'
 process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret'
 process.env.STRIPE_SECRET_KEY='sk_test_fake'
 process.env.STRIPE_WEBHOOK_SECRET='whsec_fake'
 globalThis.fetch=async(input,opts={})=>{
  const url=new URL(input)
  if(url.pathname==='/auth/v1/user')return json({id:owner})
  if(url.pathname==='/v1/checkout/sessions'){
   const p=new URLSearchParams(opts.body)
   assert.equal(p.get('line_items[0][price_data][unit_amount]'),'125000')
   return json({url:'https://checkout.stripe.com/test',id:'cs_test_1',expires_at:Math.floor(Date.now()/1000)+3600})
  }
  if(url.pathname.endsWith('/agency_operations')){
   if(opts.method==='PATCH'){sent.push({type:'paid_invoice',data:JSON.parse(opts.body)});return empty()}
   return json([savedRecord])
  }
  if(url.pathname.endsWith('/agency_stripe_events')){
   if(opts.method==='POST'){sent.push({type:'event',data:JSON.parse(opts.body)});return empty()}
   return json([])
  }
  if(url.pathname.endsWith('/agency_transactions')){sent.push({type:'payment',data:JSON.parse(opts.body)});return empty()}
  if(url.pathname.endsWith('/rpc/agency_record_stripe_payment')){sent.push({type:'atomic',data:JSON.parse(opts.body)});return json('Payment reconciled')}
  if(url.pathname.endsWith('/rpc/agency_external_touch'))return json(1)
  throw new Error(`Unexpected ${url.pathname}`)
 }
 try{
  const checkoutResult=await checkout(new Request('https://test.netlify.app/.netlify/functions/stripe-checkout',{method:'POST',headers:{authorization:'Bearer signed-in-user', 'Content-Type':'application/json'},body:JSON.stringify({recordId:'invoice-1'})}))
  assert.equal(checkoutResult.status,200)
  const created=Math.floor(Date.now()/1000)
  const event={id:'evt-test-1',created,type:'checkout.session.completed',data:{object:{id:'cs_test_1',payment_status:'paid',amount_total:125000,currency:'dkk',metadata:{owner_id:owner,record_id:'invoice-1'}}}}
  const raw=JSON.stringify(event),sig=createHmac('sha256','whsec_fake').update(`${created}.${raw}`).digest('hex')
  const webhookResult=await webhook(new Request('https://test.netlify.app/.netlify/functions/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${created},v1=${sig}`},body:raw}))
  assert.equal(webhookResult.status,200)
  assert.equal(sent.find(item=>item.type==='atomic').data.p_amount_cents,125000)
  assert.equal(sent.find(item=>item.type==='atomic').data.p_payment,'cs_test_1')
  assert.equal(sent.filter(item=>item.type==='paid_invoice'||item.type==='payment').length,0)
 }finally{globalThis.fetch=oldFetch;process.env=oldEnv}
})
test('linked native Stripe invoice payments use verified events; unmatched and unpaid invoices do not create revenue',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let calls=[]
 process.env.SUPABASE_URL='https://testproject.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret';process.env.STRIPE_WEBHOOK_SECRET='whsec_fake'
 globalThis.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));return json('Payment reconciled')}
 const send=async object=>{const created=Math.floor(Date.now()/1000),event={id:'evt_native',created,type:'invoice.payment_succeeded',data:{object}},raw=JSON.stringify(event),sig=createHmac('sha256','whsec_fake').update(`${created}.${raw}`).digest('hex');return webhook(new Request('https://test.netlify.app/.netlify/functions/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${created},v1=${sig}`},body:raw}))}
 try{
  assert.equal((await send({id:'in_native',status:'paid',amount_paid:125000,currency:'dkk',metadata:{owner_id:owner,record_id:'invoice-1'}})).status,200)
  assert.equal(calls[0].p_payment,'in_native');assert.equal(calls[0].p_amount_cents,125000)
  await send({id:'in_other',status:'paid',amount_paid:125000,currency:'dkk',metadata:{}})
  await send({id:'in_late',status:'open',amount_paid:0,currency:'dkk',metadata:{owner_id:owner,record_id:'invoice-1'}})
  assert.equal(calls.length,1)
 }finally{globalThis.fetch=oldFetch;process.env=oldEnv}
})
