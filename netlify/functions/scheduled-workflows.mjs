// Optional daily server-side automation: one owner, internal tasks ONLY.
// Deploy to Netlify; secure variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENCY_OWNER_ID.
// Never send client emails or change payment status. Safe to retry: stable IDs + ignore duplicates.
import {planAgencyActions} from '../lib/workflow-core.mjs'
export const config={schedule:'30 5 * * *'}
const respond=(message,status=200)=>new Response(message,{status})
const h=(key)=>({apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'})
export default async function handler(){
  const base=(process.env.SUPABASE_URL||'').replace(/\/+$/,''),secret=process.env.SUPABASE_SERVICE_ROLE_KEY||'',owner=process.env.AGENCY_OWNER_ID||''
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!secret||!/^[-0-9a-f]{36}$/i.test(owner))return respond('Scheduled workflows not configured',503)
  const url=(resource)=>`${base}/rest/v1/${resource}`
  const request=async(resource,opts={})=>{
    const res=await fetch(url(resource),{...opts,headers:{...h(secret),...(opts.headers||{})},signal:AbortSignal.timeout(15000)})
    if(!res.ok)throw new Error(`Backend ${res.status}`)
    return res.status===204?null:res.json()
  }
  try{
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    // Raw payload is required; the database's denormalized columns are not sufficient.
    const [prefs,leadRows,projectRows,operationRows,taskRows]=await Promise.all([
      request(`agency_preferences?owner_id=eq.${owner}&select=preferences&limit=1`),
      request(`agency_leads?owner_id=eq.${owner}&select=payload&limit=3000`),
      request(`agency_projects?owner_id=eq.${owner}&select=payload&limit=3000`),
      request(`agency_operations?owner_id=eq.${owner}&select=id,payload&limit=3000`),
      request(`agency_tasks?owner_id=eq.${owner}&select=id&limit=5000`)
    ])
    const result=planAgencyActions({preferences:prefs?.[0]?.preferences||{},leads:leadRows.map(x=>x.payload),projects:projectRows.map(x=>x.payload),operations:operationRows.map(x=>x.payload),existingTaskIds:taskRows.map(x=>x.id),existingOpsIds:operationRows.map(x=>x.id)},day)
    const newTasks=result.tasks.map(t=>({owner_id:owner,id:t.id,client_id:t.clientId||null,project_id:t.projectId||null,title:t.title,due_date:t.dueDate||null,done:false,payload:t}))
    const newOps=result.operations.map(op=>({owner_id:owner,id:op.id,client_id:op.clientId||null,project_id:op.projectId||null,category:op.category,title:op.title,due_date:op.dueDate||null,payload:op}))
    // REST batch insert is idempotent; background writes trigger a revision bump for optimistic locking.
    if(newTasks.length)await request('agency_tasks',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(newTasks)})
    if(newOps.length)await request('agency_operations',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(newOps)})
    if(newTasks.length||newOps.length)await request('rpc/agency_external_touch',{method:'POST',body:JSON.stringify({p_owner:owner})})
    return respond(`Completed ${newTasks.length} task(s), ${newOps.length} operations request(s)`)
  }catch(e){console.error('Scheduled workflows failed:',e instanceof Error?e.message:'unknown');return respond('Scheduled workflows failed',503)}
}
