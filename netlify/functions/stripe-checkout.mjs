import {createHash} from 'node:crypto'
// Creates Stripe Checkout from a saved, owner-verified invoice record.
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (server only).
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
export default async function handler(req){
  if(req.method!=='POST')return respond({error:'Method not allowed'},405)
  try{
    const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,''),service=process.env.SUPABASE_SERVICE_ROLE_KEY||'',stripe=process.env.STRIPE_SECRET_KEY||''
    if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!service||!stripe)return respond({error:'Stripe or Supabase server configuration missing'},503)
    const bearer=(req.headers.get('authorization')||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
    if(!bearer)return respond({error:'Authentication required'},401)
    const ownerResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(10000)})
    if(!ownerResponse.ok)return respond({error:'Authentication failed'},401)
    const owner=(await ownerResponse.json()).id
    const input=await req.json().catch(()=>({}))
    if(!/^[a-zA-Z0-9:_-]{1,120}$/.test(input.recordId||''))return respond({error:'Invalid invoice ID'},400)
    const query=`agency_operations?owner_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(input.recordId)}&select=id,category,title,payload,client_id,project_id&limit=1`
    const options={headers:{apikey:service,Authorization:`Bearer ${service}`},signal:AbortSignal.timeout(10000)}
    const invoiceResponse=await fetch(`${base}/rest/v1/${query}`,options)
    if(!invoiceResponse.ok)return respond({error:'Could not load invoice'},502)
    const row=(await invoiceResponse.json())[0]
    if(!row||row.category!=='invoices')return respond({error:'Invoice not found'},404)
    const invoice=row.payload, amount=Number(invoice.amount),currency=(invoice.currency||'DKK').toLowerCase()
    if(!Number.isFinite(amount)||amount<=0||amount>100000000||!['dkk','eur','usd'].includes(currency))return respond({error:'Invoice requires a positive supported amount'},400)
    if(['Paid','Cancelled'].includes(invoice.status))return respond({error:'Invoice is already paid or cancelled'},409)
    const vat=invoice.vatRate==null?0:Number(invoice.vatRate)
    if(!Number.isFinite(vat)||vat<0||vat>100)return respond({error:'Invalid invoice VAT rate'},400)
    const cents=Math.round(amount*(1+vat/100)*100)
    if(cents<50)return respond({error:'Invoice amount is too small for checkout'},400)
    const params=new URLSearchParams({
      'mode':'payment',
      'line_items[0][price_data][currency]':currency,
      'line_items[0][price_data][unit_amount]':String(cents),
      'line_items[0][price_data][product_data][name]':String(invoice.title||'Agency invoice').slice(0,150),
      'line_items[0][quantity]':'1',
      'metadata[owner_id]':owner,
      'metadata[record_id]':row.id,
      'success_url':`${new URL(req.url).origin}/?stripe=success`,
      'cancel_url':`${new URL(req.url).origin}/?stripe=cancelled`
    })
    const stripeResponse=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${stripe}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`agency-${createHash('sha256').update(`${owner}:${row.id}:${cents}:${currency}:${Math.floor(Date.now()/86400000)}`).digest('hex')}`},body:params,signal:AbortSignal.timeout(15000)})
    const session=await stripeResponse.json()
    if(!stripeResponse.ok||!session.url)return respond({error:session.error?.message||'Stripe rejected checkout request'},502)
    return respond({url:session.url,sessionId:session.id,expiresAt:session.expires_at})
  }catch(error){console.error('Stripe checkout error',error instanceof Error?error.message:'Unknown');return respond({error:'Stripe Checkout is unavailable'},503)}
}
