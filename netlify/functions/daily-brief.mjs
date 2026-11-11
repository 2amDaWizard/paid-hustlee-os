// Optional 06:00 UTC owner-only digest. Never emails clients or exposes keys in the frontend.
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// AGENCY_OWNER_ID, AGENCY_NOTIFICATION_EMAIL, EMAIL_FROM; notification-delivery.sql.
export const config={schedule:'0 6 * * *'}
const headers=(key)=>({apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'})
const escape=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const respond=(s,n=200)=>new Response(s,{status:n})
export default async function handler(){
  const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'',resend=process.env.RESEND_API_KEY||''
  const owner=process.env.AGENCY_OWNER_ID||'',to=process.env.AGENCY_NOTIFICATION_EMAIL||'',from=process.env.EMAIL_FROM||''
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!key||!resend||!/^[-0-9a-f]{36}$/i.test(owner)||!to.includes('@')||!from.includes('@'))return respond('Daily digest not configured',503)
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const query=async(path,opts={})=>{
    const res=await fetch(`${base}/rest/v1/${path}`,{...opts,headers:{...headers(key),...(opts.headers||{})},signal:AbortSignal.timeout(15000)})
    if(!res.ok)throw new Error(`Database HTTP ${res.status}`)
    return res.status===204?null:res.json()
  }
  try{
    const old=await query(`agency_notification_delivery?owner_id=eq.${owner}&delivery_day=eq.${day}&kind=eq.daily-brief&select=owner_id&limit=1`)
    if(old?.length)return respond('Already delivered')
    const [tasks,leads,operations,projects]=await Promise.all([
      query(`agency_tasks?owner_id=eq.${owner}&done=eq.false&select=title,due_date,payload&limit=200`),
      query(`agency_leads?owner_id=eq.${owner}&select=company,payload&limit=200`),
      query(`agency_operations?owner_id=eq.${owner}&select=category,title,due_date,payload&limit=200`),
      query(`agency_projects?owner_id=eq.${owner}&select=name,payload&limit=200`)
    ])
    const cut=new Date(Date.now()+3*86400000).toISOString().slice(0,10)
    const alerts=[]
    for(const task of tasks||[])if(task.due_date&&task.due_date<=cut)alerts.push(`Task: ${task.title} — ${task.due_date}`)
    for(const lead of leads||[]){const p=lead.payload;if(p.followUp&&p.followUp<=cut&&!['Lost','Closed Won'].includes(p.stage))alerts.push(`Lead follow-up: ${lead.company} — ${p.followUp}`)}
    for(const op of operations||[]){const p=op.payload;if(op.category!=='invoices'&&op.due_date&&op.due_date<=cut&&!['Paid','Completed','Cancelled','Sent','Renewed','Ended','Archived'].includes(p.status))alerts.push(`${op.category}: ${op.title} — ${op.due_date}`)}
    for(const project of projects||[]){const p=project.payload;if(p.nextFollowUp&&p.nextFollowUp<=cut&&!p.archivedAt&&p.status!=='Completed')alerts.push(`Project follow-up: ${project.name} — ${p.nextFollowUp}`)}
    const lines=alerts.slice(0,35)
    const html=`<h1>PAID HUSTLE daily agency brief</h1><p>${escape(day)} · ${alerts.length} due or upcoming action(s)</p><ul>${lines.map(l=>`<li>${escape(l)}</li>`).join('')}</ul>${alerts.length>35?'<p>More items are waiting in your workspace.</p>':''}<p>Payment status must always be verified with Stripe before sending requests.</p>`
    const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json','Idempotency-Key':`daily-brief-${owner}-${day}`},body:JSON.stringify({from,to:[to],subject:`PAID HUSTLE brief · ${day} (${alerts.length} actions)`,html}),signal:AbortSignal.timeout(15000)})
    if(!sent.ok)throw new Error(`Email provider HTTP ${sent.status}`)
    await query('agency_notification_delivery',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_id:owner,delivery_day:day,kind:'daily-brief'})})
    return respond('Daily digest delivered')
  }catch(error){console.error('Daily brief error:',error instanceof Error?error.message:'unknown');return respond('Daily digest failed',503)}
}
