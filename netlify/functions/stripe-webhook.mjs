// Verify the raw signed Stripe payload, then reconcile payment to a saved invoice.
// Does not treat customer browser success redirects as payment confirmation.
import {createHmac,timingSafeEqual} from 'node:crypto'
export function verifyStripeSignature(raw,signature,secret,now=Math.floor(Date.now()/1000)){
  if(!secret||!signature||typeof raw!=='string')return false
  const parts=signature.split(',').map(s=>s.trim())
  const t=parts.find(s=>s.startsWith('t='))?.slice(2)
  const v=parts.filter(s=>s.startsWith('v1=')).map(s=>s.slice(3))
  const timestamp=Number(t)
  if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>300||!v.length)return false
  const expected=createHmac('sha256',secret).update(`${t}.${raw}`,'utf8').digest()
  return v.some(value=>{if(!/^[0-9a-f]{64}$/i.test(value))return false;const candidate=Buffer.from(value,'hex');return candidate.length===expected.length&&timingSafeEqual(candidate,expected)})
}
const response=(text,status=200)=>new Response(text,{status,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}})
export default async function handler(req){
  if(req.method!=='POST')return response('Method not allowed',405)
  const secret=process.env.STRIPE_WEBHOOK_SECRET||''
  const raw=await req.text()
  if(raw.length>300000)return response('Too large',413)
  if(!verifyStripeSignature(raw,req.headers.get('stripe-signature'),secret))return response('Invalid Stripe signature',400)
  let event
  try{event=JSON.parse(raw)}catch{return response('Invalid JSON',400)}
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','invoice.payment_succeeded'].includes(event.type))return response('Event ignored')
  const object=event.data?.object||{}
  // Explicitly linked native Stripe invoices use the same atomic receipt path.
  // payment_succeeded excludes an invoice merely marked paid outside Stripe.
  const session=event.type==='invoice.payment_succeeded'?{...object,payment_status:object.status==='paid'?'paid':'unpaid',amount_total:object.amount_paid}:object
  const owner=session.metadata?.owner_id,recordId=session.metadata?.record_id
  if(session.payment_status!=='paid'||!/^[-0-9a-f]{36}$/i.test(owner||'')||!recordId||!event.id)return response('No paid invoice to reconcile')
  const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,''),service=process.env.SUPABASE_SERVICE_ROLE_KEY||''
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!service)return response('Server database not configured',503)
  const headers={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'}
  const api=async(path,options={})=>{
    const res=await fetch(`${base}/rest/v1/${path}`,{...options,headers:{...headers,...(options.headers||{})},signal:AbortSignal.timeout(12000)})
    if(!res.ok)throw new Error(`${path}: HTTP ${res.status}`)
    return res.status===204?null:res.json()
  }
  try{
    const result=await api('rpc/agency_record_stripe_payment',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:recordId,p_event:event.id,p_event_type:event.type,p_payment:session.id,p_amount_cents:session.amount_total,p_currency:session.currency,p_paid_at:new Date((event.created||Math.floor(Date.now()/1000))*1000).toISOString()})})
    return response('Payment reconciled')
  }catch(error){console.error('Stripe reconciliation error:',error instanceof Error?error.message:'Unknown');return response('Temporary reconciliation problem',503)}
}
