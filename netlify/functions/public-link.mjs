// Limited-use public links for onboarding, discovery requests and approvals.
// All administrative operations require a real Supabase user JWT.
// Deployment prerequisites: public-client-links.sql and server-only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import {randomBytes,createHash} from 'node:crypto'

const LIMIT=10_000
const secureHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}
const reply=(body,status=200,html=false)=>new Response(body,{status,headers:{...secureHeaders,'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8'}})
const message=(text,status)=>reply(JSON.stringify({error:text}),status)
const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const digest=(token)=>createHash('sha256').update(token).digest('hex')
const norm=(value,limit=250)=>String(value??'').trim().slice(0,limit)
const approvalFingerprint=(record)=>digest(JSON.stringify([record.id,record.payload?.title,record.payload?.details,record.payload?.amount,record.payload?.currency,record.payload?.dueDate,record.payload?.dealType,record.payload?.agreementEnd,record.payload?.vatRate]))
const env=()=>({base:(process.env.SUPABASE_URL||'').replace(/\/+$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY||''})
async function rest(table,options={}){
  const {base,key}=env()
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!key)throw new Error('Server integration is not configured')
  const url=`${base}/rest/v1/${table}`
  const response=await fetch(url,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw new Error(`Database rejected request (${response.status})`)
  if(response.status===204)return null
  return response.json()
}
async function authOwner(req){
  const token=(req.headers.get('authorization')||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
  if(!token)return null
  const {base,key}=env()
  const response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)})
  if(!response.ok)return null
  const user=await response.json()
  return /^[0-9a-f-]{36}$/i.test(user.id)?user.id:null
}
const json=(data)=>JSON.stringify(data)
const findRecord=async(owner,id)=>{
  const rows=await rest(`agency_operations?owner_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}&select=id,category,title,client_id,project_id,payload&limit=1`)
  return rows?.[0]||null
}
async function createLink(req){
  const owner=await authOwner(req)
  if(!owner)return message('Sign in to create a link',401)
  const body=await req.json().catch(()=>null)
  const recordId=norm(body?.recordId,120),kind=norm(body?.kind,20)
  if(!recordId||!['intake','booking','approval'].includes(kind))return message('Invalid link request',400)
  const record=await findRecord(owner,recordId)
  if(!record)return message('Record not found',404)
  const allowed={intake:['onboarding'],booking:['bookings'],approval:['proposals','qa','handovers','reports','documents']}
  if(!allowed[kind].includes(record.category))return message('This link type does not match the record category',400)
  const token=randomBytes(32).toString('hex')
  await rest('agency_public_links',{method:'POST',headers:{Prefer:'return=minimal'},body:json({owner_id:owner,record_id:record.id,kind,token_hash:digest(token),review_hash:kind==='approval'?approvalFingerprint(record):null,expires_at:new Date(Date.now()+14*86400000).toISOString()})})
  return reply(json({url:`${new URL(req.url).origin}/.netlify/functions/public-link?t=${token}`,expiresInDays:14}))
}
async function publicEntry(token){
  if(!/^[0-9a-f]{64}$/.test(token))return null
  const rows=await rest(`agency_public_links?token_hash=eq.${digest(token)}&select=id,owner_id,record_id,kind,expires_at,used_at,review_hash&limit=1`)
  const link=rows?.[0]
  if(!link||link.used_at||Date.parse(link.expires_at)<=Date.now())return null
  const record=await findRecord(link.owner_id,link.record_id)
  if(!record)return null
  return {link,record,changed:link.kind==='approval'&&link.review_hash&&link.review_hash!==approvalFingerprint(record)}
}
function page(kind,record,token){
  const title=record.title
  const label={intake:'Client onboarding questionnaire',booking:'Request a discovery call',approval:'Review and approve'}[kind]
  const common='<label>Your name <input required name="name" maxlength="120" autocomplete="name"></label><label>Email <input required type="email" name="email" maxlength="220" autocomplete="email"></label>'
  const document=kind==='approval'?`<section style="background:#f0f5f3;border-radius:10px;padding:18px;margin:22px 0;white-space:pre-wrap;overflow-wrap:anywhere"><strong>Document being reviewed</strong><p>${esc(record.payload?.details||'No details provided')}</p>${record.payload?.amount!=null?`<p>Recorded amount: ${esc(record.payload.amount)} ${esc(record.payload.currency||'DKK')}</p>`:''}${record.payload?.dealType?`<p>Agreement type: ${esc(record.payload.dealType)}</p>`:''}${record.payload?.agreementEnd?`<p>Agreement end: ${esc(record.payload.agreementEnd)}</p>`:''}${record.payload?.dueDate?`<p>Due date: ${esc(record.payload.dueDate)}</p>`:''}</section>`:''
  const fields=kind==='booking'?'<label>Preferred date <input required type="date" name="date"></label><label>Preferred time <input required type="time" name="time"></label>':kind==='approval'?'<label>Decision <select name="decision"><option value="approved">Approve</option><option value="changes">Request changes</option></select></label>':'<label>Contact phone (optional) <input name="phone" maxlength="60"></label>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(label)}</title><style>body{font:16px system-ui;background:#f4f7f7;color:#18242c;margin:0;padding:48px 16px}main{max-width:580px;margin:auto;background:white;border:1px solid #dce5e6;border-radius:16px;padding:28px}h1{margin:0 0 8px}p{color:#4f6470;line-height:1.5}label{display:block;margin-top:20px;font-weight:600}input,textarea,select{box-sizing:border-box;margin-top:8px;width:100%;font:inherit;border:1px solid #b9c5cb;border-radius:8px;padding:12px}textarea{min-height:110px}button{border:0;background:#0c8074;color:#fff;padding:13px 18px;border-radius:8px;margin-top:24px;font-weight:700}small{color:#596c76}</style></head><body><main><h1>${esc(label)}</h1><p>${esc(title)}</p><form method="POST" action="/.netlify/functions/public-link?t=${esc(token)}">${document}${common}${fields}<label>${kind==='intake'?'Project requirements / goals':kind==='booking'?'What would you like to discuss?':'Feedback / requested changes'}<textarea name="notes" maxlength="4000"></textarea></label><label style="position:absolute;left:-10000px">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label>${kind==='approval'?'<label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" required name="acknowledged" value="yes" style="width:auto;margin-top:5px"><span>I have reviewed the scope shown above and agree that my typed name and response are recorded electronically.</span></label>':''}<p><small>This request is delivered to the agency. Meeting requests are not confirmed bookings. This acknowledgement is not an independently verified qualified electronic signature.</small></p><button type="submit">Submit securely</button></form></main></body></html>`
}
async function submitPublic(req,entry){
  const {link,record,changed}=entry
  if(changed)return reply('This document has changed since the review link was issued. Ask the agency for a new link.',409)
  const raw=await req.text()
  if(raw.length>LIMIT)return reply('Submission too large',413)
  const form=new URLSearchParams(raw)
  if(form.get('website'))return reply('Thanks, received.',200)
  const name=norm(form.get('name'),120),email=norm(form.get('email'),220),notes=norm(form.get('notes'),4000)
  const date=norm(form.get('date'),10),time=norm(form.get('time'),5),decision=norm(form.get('decision'),16),phone=norm(form.get('phone'),60)
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return reply('Please provide your name and valid email',400)
  if(link.kind==='booking'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d\d:\d\d$/.test(time)))return reply('Select a valid requested date/time',400)
  if(link.kind==='approval'&&!['approved','changes'].includes(decision))return reply('Select a decision',400)
  if(link.kind==='approval'&&form.get('acknowledged')!=='yes')return reply('Confirm that you reviewed this document',400)
  const payload={name,email,phone,notes,date,time,decision,recordId:record.id,acknowledged:link.kind==='approval',reviewHash:link.review_hash||null,receivedAt:new Date().toISOString()}
  const title=link.kind==='intake'?`Intake received: ${record.title}`:link.kind==='booking'?`Booking request: ${record.title}`:`Approval response: ${record.title}`
  const details=`Submitted by ${name} (${email})\n${phone?`Phone: ${phone}\n`:''}${date?`Requested: ${date} ${time}\n`:''}${decision?`Decision: ${decision}\n`:''}${notes}`
  const id=`public:${link.id}`
  const now=new Date().toISOString()
  const operation={id,category:'communications',title,clientId:record.client_id||'',projectId:record.project_id||'',status:'Logged',dueDate:'',amount:null,currency:'DKK',url:'',details,checklist:[],createdAt:now,updatedAt:now}
  await rest('rpc/agency_submit_public_response',{method:'POST',body:json({p_token_hash:digest(new URL(req.url).searchParams.get('t')||''),p_expected_record:record.payload,p_response:payload,p_operation:operation})})
  return reply(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Received</title><body style="font:18px system-ui;max-width:600px;margin:10vh auto;padding:25px"><h1>Thank you</h1><p>Your response has been received. ${link.kind==='booking'?'The agency will contact you to confirm a meeting.':'The agency will review your submission.'}</p></body></html>`,200,true)
}
export default async function handler(req){
  try{
    if(req.method==='POST'&&req.headers.get('authorization'))return await createLink(req)
    const token=new URL(req.url).searchParams.get('t')||''
    const entry=await publicEntry(token)
    if(!entry)return reply('This link is invalid, expired, or has already been used.',410)
    if(req.method==='GET'){if(entry.changed)return reply('This document has changed. Ask the agency for a new approval link.',409);return reply(page(entry.link.kind,entry.record,token),200,true)}
    if(req.method==='POST'&&req.headers.get('content-type')?.includes('application/x-www-form-urlencoded'))return await submitPublic(req,entry)
    return message('Method not allowed',405)
  }catch(error){
    console.error('Public link request error:',error instanceof Error?error.message:'unknown')
    return message('This service is currently unavailable. Contact the agency directly.',503)
  }
}
