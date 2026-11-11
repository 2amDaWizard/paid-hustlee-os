import {applyTemplate,setChecklistDone} from './workflow'
import {monthlyDeadline} from './agency-rules'
import {applyAutomations} from './automation-engine'
import { useMemo, useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CalendarDays, Check, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Copy, Download, ExternalLink, FileText, Filter, FolderOpen, History, Link2, Plus, Search, Trash2, Users, X } from 'lucide-react'
import type { Workspace, OperationsRecord, OperationsCategory } from './types'
import { uid, today, formatDate, formatMoney, defaultTask } from './data'
import type { SupabaseClient, Session } from '@supabase/supabase-js'

type RecordConfig = { name: string; subtitle: string; empty: string; statuses: string[]; template?: string[]; color?: string }
export const OPS_CONFIG: Record<OperationsCategory,RecordConfig> = {
  proposals: {name:'Proposals & agreements',subtitle:'Draft offers, agree scope and keep contract links.',empty:'Create your first proposal.',statuses:['Draft','Sent','Accepted','Declined']},
  invoices: {name:'Invoices & payment links',subtitle:'Track invoice balances and secure external checkout links. Stripe remains responsible for actual payments and reminders.',empty:'Create an invoice record.',statuses:['Draft','Sent','Part-paid','Paid','Overdue','Cancelled']},
  bookings: {name:'Meeting requests & log',subtitle:'Record meetings and share secure appointment request links; meeting confirmation remains yours.',empty:'Add a discovery call.',statuses:['Requested','Scheduled','Completed','Cancelled','No-show']},
  communications: {name:'Communication log',subtitle:'Record calls, emails, WhatsApp updates and important decisions.',empty:'Log a conversation.',statuses:['Logged','Follow-up needed','Resolved']},
  outreach: {name:'Manual outreach planner',subtitle:'Organize prospecting touches and follow-up sequences.',empty:'Log your first outreach activity.',statuses:['Planned','Contacted','Replied','Meeting booked','Closed']},
  onboarding: {name:'Client onboarding',subtitle:'Reusable intake and kickoff checklists; public intake collection requires secure backend setup.',empty:'Create an onboarding checklist.',statuses:['Preparing','Awaiting client','Received','Completed'],template:['Confirm primary contact','Collect project brief','Confirm scope and timeline','Request access and assets','Schedule kickoff']},
  qa: {name:'Launch quality assurance',subtitle:'Check websites and campaigns before launching.',empty:'Create a launch checklist.',statuses:['To check','In review','Approved to launch','Launched'],template:['Check mobile layout','Test forms and key links','Verify conversion tracking','Confirm agreed budget','Record client approval']},
  handovers: {name:'Project handover',subtitle:'Track final delivery, approvals, payments and archival.',empty:'Start a project handover.',statuses:['Preparing','Waiting for approval','Handed over','Closed'],template:['Send final deliverables','Confirm client acceptance','Review outstanding invoices','Transfer agreed access','Archive project']},
  accounts: {name:'Client account access',subtitle:'Track permission status and safe dashboard URLs; never put passwords here.',empty:'Add the first access record.',statuses:['Requested','Access granted','Access missing','Revoked']},
  retainers: {name:'Monthly retainer deliveries',subtitle:'Track each month’s contracted deliverables; use the checklist to mark what is delivered.',empty:'Create a retainer delivery period.',statuses:['Planned','In progress','Delivered','Needs review'],template:['Produce agreed deliverables','Complete campaign reviews','Send client update','Confirm monthly delivery']},
  renewals: {name:'Contract renewals',subtitle:'Keep contract dates, notice periods and renewal conversations visible.',empty:'Add a contract renewal.',statuses:['Upcoming','Contact client','Negotiating','Renewed','Ended']},
  documents: {name:'Existing document references',subtitle:'Keep safe links to documents. Private uploads need storage setup.',empty:'Add a document reference.',statuses:['Draft','Shared','Approved','Archived']},
  templates: {name:'Project templates',subtitle:'Keep repeatable checklists and use them when setting up projects.',empty:'Create a project template.',statuses:['Active','Archived'],template:['Confirm requirements','Prepare first draft','Internal QA','Client review','Final delivery']},
  weekly: {name:'Weekly review',subtitle:'Reflect on sales, delivery and finance, then plan next week.',empty:'Start this week’s review.',statuses:['Draft','Finished'],template:['Review CRM follow-ups','Review project deadlines','Check outstanding invoices','Choose top priorities']},
  reports: {name:'Client progress updates',subtitle:'Draft project progress messages using recorded milestones and task status.',empty:'Create a client update.',statuses:['Draft','Reviewed','Sent']},
}
const GROUPS: {name:string;categories:OperationsCategory[]}[] = [
  {name:'Sales',categories:['outreach','bookings','proposals']},
  {name:'Client care',categories:['communications','onboarding','accounts','renewals']},
  {name:'Delivery',categories:['qa','retainers','handovers','templates','reports']},
  {name:'Money & files',categories:['invoices','documents']},
  {name:'My agency',categories:['weekly']},
]
const allCategories = GROUPS.flatMap(group=>group.categories)
const starterRecord = (category:OperationsCategory):OperationsRecord => ({
  id:uid(),category,title:'',clientId:'',projectId:'',status:OPS_CONFIG[category].statuses[0],dueDate:'',amount:null,currency:'DKK',url:'',details:'',checklist:(OPS_CONFIG[category].template||[]).map(label=>({id:uid(),label,done:false})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
})
const dateAlert = (d:string) => !!d && d < today()
const isValidUrl = (s:string) => {try {const u=new URL(s);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}

interface Props { syncReady:boolean; data:Workspace; setData:Dispatch<SetStateAction<Workspace>>; onNewTask:(clientId:string, projectId:string)=>void; db:SupabaseClient|null; session:Session|null; jump?:{id:string;nonce:string}|null }
// Local print view. PDF generation uses the browser print dialog, so there is no
// third-party document API and no sensitive content is sent elsewhere.
const escapeHtml = (value:unknown):string => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
function printBusinessDocument(item:OperationsRecord,data:Workspace) {
  const client=data.clients.find(c=>c.id===item.clientId)
  const title=item.category==='invoices'?'Invoice':'Proposal'
  const vatRate = item.category==='invoices'&&Number.isFinite(item.vatRate)?Number(item.vatRate):0
  const total = item.amount!=null?Math.round(item.amount*(1+vatRate/100)*100)/100:null
  const content=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${escapeHtml(item.title)}</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#1b2634}h1{margin:0;font-size:32px}h2{font-size:18px;margin-top:30px}header{display:flex;justify-content:space-between;border-bottom:3px solid #14b8a6;padding-bottom:25px}p{white-space:pre-wrap;line-height:1.6}.meta{color:#5a6b7a}.price{font-size:28px;font-weight:700;margin-top:30px}.footer{margin-top:60px;border-top:1px solid #ccc;padding-top:16px;font-size:12px;color:#5a6b7a}@media print{body{margin:15mm auto}}</style></head><body><header><div><h1>${escapeHtml(data.preferences.agencyName||'PAID HUSTLE')}</h1><div class="meta">${escapeHtml(title)}</div></div><div>${escapeHtml(new Date().toLocaleDateString('en-GB'))}</div></header><h2>${escapeHtml(item.title)}</h2><div class="meta">Prepared for: ${escapeHtml(client?.name||'Client not specified')}${client?.email?` · ${escapeHtml(client.email)}`:''}</div><p>Status: ${escapeHtml(item.status)}${item.dueDate?` · Relevant date: ${escapeHtml(item.dueDate)}`:''}</p>${item.amount!=null?`<div class="price">Subtotal: ${escapeHtml(formatMoney(item.amount,item.currency))}${vatRate?`<p class="meta">VAT (${vatRate}%): ${escapeHtml(formatMoney((total??0)-item.amount,item.currency))}</p><strong>Total: ${escapeHtml(formatMoney(total??0,item.currency))}</strong>`:''}</div>`:''}<h2>Details</h2><p>${escapeHtml(item.details||'No description recorded.')}</p><div class="footer">Review all details before sharing this document. This printout does not constitute an electronically signed agreement or payment confirmation.</div></body></html>`
  const popup=window.open('','_blank')
  if(!popup){alert('Allow pop-ups for PAID HUSTLE to print or save this document as a PDF.');return}
  popup.opener=null
  popup.document.open();popup.document.write(content);popup.document.close();popup.focus()
  // User can choose Save as PDF in the system print dialog.
  popup.print()
}

export default function OperationsPage({data,setData,onNewTask,db,session,jump,syncReady}:Props) {
  const [category,setCategory]=useState<OperationsCategory>('proposals')
  useEffect(()=>{
    if(!jump)return
    const record=(data.operations||[]).find(r=>r.id===jump.id)
    if(record){setCategory(record.category);setEditing({...record,checklist:record.checklist||[]});setError('');setSharedLink('')}
  },[jump?.nonce])
  const [search,setSearch]=useState('')
  const [editing,setEditing]=useState<OperationsRecord|null>(null)
  const [filter,setFilter]=useState('Active')
  const [error,setError]=useState('')
  const [copied,setCopied]=useState(false)
  const [newChecklist,setNewChecklist]=useState('')
  const [sharedLink,setSharedLink]=useState('')
  const [linkBusy,setLinkBusy]=useState(false)
  const [stripeBusy,setStripeBusy]=useState(false)
  const createStripeCheckout=async(item:OperationsRecord)=>{
    if(!db||!session){setError('Sign in to use Stripe Checkout.');return}
    if(!syncReady){setError('Wait for Cloud data saved before creating Checkout.');return}
    if(!(data.operations||[]).some(r=>r.id===item.id)){setError('Save the invoice first.');return}
    if(JSON.stringify((data.operations||[]).find(r=>r.id===item.id))!==JSON.stringify(item)){setError('Save your changes before creating Checkout.');return}
    setStripeBusy(true)
    try{
      const response=await fetch('/.netlify/functions/stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({recordId:item.id})})
      const result=await response.json()
      if(!response.ok||!result.url)throw new Error(result.error||'Unable to create checkout')
      setEditing(prev=>prev?{...prev,url:result.url,status:'Sent'}:null)
      setData(prev=>({...prev,operations:(prev.operations||[]).map(r=>r.id===item.id?{...r,url:result.url,status:'Sent'}:r)}))
      setError('Stripe Checkout created. Copy the secure checkout URL or open it from the record. Payment status changes only after a verified Stripe webhook. Save any other unsaved edits separately.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create Stripe Checkout')}
    finally{setStripeBusy(false)}
  }
  const createPublicLink=async(item:OperationsRecord)=>{
    if(!db||!session){setError('Sign in to the cloud workspace to create a secure client link.');return}
    if(!syncReady){setError('Wait for Cloud data saved before creating a public link.');return}
    if(!(data.operations||[]).some(r=>r.id===item.id)){setError('Save this record before creating a client link.');return}
    const kind=item.category==='onboarding'?'intake':item.category==='bookings'?'booking':['proposals','qa','handovers','reports','documents'].includes(item.category)?'approval':null
    if(!kind)return
    setLinkBusy(true)
    try{
      const response=await fetch('/.netlify/functions/public-link',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({recordId:item.id,kind})})
      const result=await response.json()
      if(!response.ok||!result.url)throw new Error(result.error||'Could not create link')
      setSharedLink(result.url);setError('')
    }catch(e){setError(e instanceof Error?e.message:'Could not generate link. Check server configuration.')}
    finally{setLinkBusy(false)}
  }
  const items=data.operations||[]
  const counts=useMemo(()=>Object.fromEntries(allCategories.map(c=>[c,items.filter(i=>i.category===c).length])) as Record<OperationsCategory,number>,[items])
  const visible=items.filter(i=>i.category===category&&(filter==='All'||!['Paid','Cancelled','Closed','Archived','Ended','Declined'].includes(i.status))&&`${i.title} ${i.details} ${i.status}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'))
  const selectedProject=(data.projects||[]).find(p=>p.id===editing?.projectId)
  const change=(field:keyof OperationsRecord,value:unknown)=>setEditing(prev=>prev?({...prev,[field]:value,updatedAt:new Date().toISOString()} as OperationsRecord):null)
  const save=()=>{
    if (!editing?.title.trim()){setError('Enter a name or subject before saving.');return}
    if(editing.vatRate!=null&&(!Number.isFinite(editing.vatRate)||editing.vatRate<0||editing.vatRate>100)){setError('VAT must be between 0 and 100%.');return}
    if (editing.url.trim()&&!isValidUrl(editing.url.trim())){setError('Use a valid https:// or http:// link.');return}
    if(editing.projectId && selectedProject && editing.clientId && selectedProject.clientId!==editing.clientId){setError('The selected project belongs to another client.');return}
    if(editing.filePath&&editing.fileDeletedAt){setError('This file has been removed. Its historical record is retained.');return}
    setData(prev=>{for(const step of editing.checklist){const before=(prev.operations||[]).find(r=>r.id===editing.id)?.checklist.find(s=>s.id===step.id);if(before&&before.done!==step.done)prev=setChecklistDone(prev,editing,step.id,step.done)}return {...prev,operations:[(()=>{const saved=(prev.operations||[]).find(r=>r.id===editing.id);return saved?.paymentSource==='stripe'?{...editing,status:saved.status,amount:saved.amount,currency:saved.currency,vatRate:saved.vatRate,clientId:saved.clientId,projectId:saved.projectId,stripeInvoiceId:saved.stripeInvoiceId,paymentSource:saved.paymentSource,stripePaymentId:saved.stripePaymentId}:editing})(),...(prev.operations||[]).filter(item=>item.id!==editing.id)],activityLog:[{id:uid(),date:new Date().toISOString(),label:`${OPS_CONFIG[editing.category].name}: ${editing.title} updated`},...(prev.activityLog||[])].slice(0,250)}})
    setEditing(null);setError('');setNewChecklist('')
  }
  const remove=(item:OperationsRecord)=>{
    if(item.filePath){setError('Remove private files from the project Agreements section.');return}
    if(item.category==='invoices'&&(item.paymentSource==='stripe'||item.stripePaymentId)){setError('Stripe payment records are read-only.');return}
    if(!confirm(`Delete “${item.title}”? This removes the record from the workspace.`))return
    setData(prev=>({...prev,operations:(prev.operations||[]).filter(row=>row.id!==item.id),activityLog:[{id:uid(),date:new Date().toISOString(),label:`${OPS_CONFIG[item.category].name}: ${item.title} deleted`},...(prev.activityLog||[])].slice(0,250)}))
    setEditing(null)
  }
  const toggle=(item:OperationsRecord,stepId:string)=>setData(prev=>setChecklistDone(prev,item,stepId,!item.checklist.find(s=>s.id===stepId)?.done))
  const generateProjectTasks=(record:OperationsRecord)=>{
    if(!record.projectId){setError('Link this record to a project first.');return}
    setData(prev=>record.category==='retainers'?applyAutomations(prev,today()).workspace:applyTemplate(prev,record))
  }
  const startNewCycle=(record:OperationsRecord)=>{
    const cycle=today().slice(0,7)
    if(record.cycle===cycle)return
    setData(prev=>applyAutomations({...prev,operations:(prev.operations||[]).map(r=>r.id===record.id?{...r,cycle,status:'Planned',checklist:r.checklist.map(s=>({...s,done:false}))}:r)},today()).workspace)
  }
  const preparePayment=(record:OperationsRecord)=>{
    const id=`invoice:${record.id}`
    const existing=(data.operations||[]).find(r=>r.id===id)
    const invoice:OperationsRecord=existing||{...record,id,category:'invoices',title:record.title,status:'Draft',checklist:[],url:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
    if(!existing)setData(prev=>({...prev,operations:[invoice,...(prev.operations||[])]}))
    setCategory('invoices');setEditing(invoice);setError('')
  }
  const makeProgressReport=()=>{
    const project=(data.projects||[]).find(p=>p.id===editing?.projectId)
    if(!project)return
    const linked=data.tasks.filter(t=>t.projectId===project.id)
    const finished=linked.filter(t=>t.done).slice(0,8).map(t=>`• ${t.title}`).join('\n')||'• Project work is progressing'
    const next=linked.filter(t=>!t.done).slice(0,8).map(t=>`• ${t.title}`).join('\n')||'• Final review and next steps to be confirmed'
    change('details',`Hello,\n\nHere is an update on ${project.name}.\n\nCompleted:\n${finished}\n\nNext steps:\n${next}\n\nCurrent stage: ${project.status}\n${project.deadline?`Target deadline: ${formatDate(project.deadline)}\n`:''}\nPlease let me know if you have any questions.\n\nPAID HUSTLE`)
  }
  return <div className="ops-page">
    <div className="page-header"><div><div className="eyebrow">AGENCY OPERATIONS</div><h1>Workflows & records</h1><p>Linked checklists and manual records. Stripe owns payments; client messages are sent by you.</p></div><button className="btn btn-primary" disabled={category==='documents'} onClick={()=>{setEditing(starterRecord(category));setError('');setSharedLink('')}}><Plus size={16}/>New {category==='invoices'?'invoice':'record'}</button></div>
    <div className="ops-layout">
      <aside className="ops-category-list" aria-label="Operations categories">{GROUPS.map(group=><div key={group.name} className="ops-group"><div className="ops-group-label">{group.name}</div>{group.categories.map(key=><button key={key} className={`ops-category ${category===key?'selected':''}`} onClick={()=>{setCategory(key);setSearch('');setFilter('Active')}}><span>{OPS_CONFIG[key].name}</span><small>{counts[key]||0}</small></button>)}</div>)}</aside>
      <section className="ops-main"><div className="ops-content-top"><div><h2>{OPS_CONFIG[category].name}</h2>{category==='documents'&&<p>Upload and access agreements inside each project. Existing records remain here.</p>}<p>{OPS_CONFIG[category].subtitle}</p></div><div className="ops-search"><Search size={15}/><input aria-label="Search records" value={search} placeholder="Search" onChange={e=>setSearch(e.target.value)}/></div></div>
        <div className="ops-filter-row"><button className={filter==='Active'?'active':''} onClick={()=>setFilter('Active')}>Current</button><button className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All records</button><span>{visible.length} shown</span></div>
        {!visible.length&&<div className="ops-empty"><FolderOpen size={28}/><h3>{OPS_CONFIG[category].empty}</h3><p>Connect it to a client or project, then keep everything in one place.</p><button className="btn btn-subtle" onClick={()=>{setEditing(starterRecord(category));setError('');setSharedLink('')}}><Plus size={15}/>Add record</button></div>}
        <div className="ops-record-list">{visible.map(item=><article key={item.id} className="ops-record"><div className="ops-record-head"><button className="ops-record-title" onClick={()=>{setEditing({...item,checklist:item.checklist||[]});setError('');setSharedLink('')}}><strong>{item.title}</strong><ChevronRight size={16}/></button><span className="ops-status">{item.status}</span></div><div className="ops-record-meta"><span>{data.clients.find(c=>c.id===item.clientId)?.name||'General'}</span>{item.dueDate&&<span className={dateAlert(item.dueDate)?'ops-overdue':''}><CalendarDays size={13}/>{formatDate(item.category==='retainers'?monthlyDeadline(item.dueDate,today()):item.dueDate)}</span>}{item.amount!=null&&<span><CircleDollarSign size={13}/>{formatMoney(item.amount,item.currency)}</span>}{item.checklist.length>0&&<span><CheckCircle2 size={13}/>{item.checklist.filter(t=>t.done).length}/{item.checklist.length} checked</span>}</div>
          {item.checklist.length>0&&<div className="ops-checks">{item.checklist.map(task=><label key={task.id}><input type="checkbox" checked={task.done} onChange={()=>toggle(item,task.id)}/><span className={task.done?'ops-done':''}>{task.label}</span></label>)}</div>}
          {item.details&&<p className="ops-details">{item.details.slice(0,220)}{item.details.length>220?'…':''}</p>}
          <div className="ops-record-actions"><button className="btn btn-subtle btn-sm" onClick={()=>{setEditing({...item,checklist:item.checklist||[]});setError('');setSharedLink('')}}>Open details</button>{item.url&&isValidUrl(item.url)&&<a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-subtle btn-sm"><ExternalLink size={14}/>Open link</a>}{(item.category==='qa'||item.category==='handovers'||item.category==='onboarding')&&<button className="btn btn-subtle btn-sm" onClick={()=>onNewTask(item.clientId,item.projectId)}>Create task</button>}{(item.category==='retainers'||item.category==='templates')&&item.checklist.length>0&&<button className="btn btn-subtle btn-sm" onClick={()=>generateProjectTasks(item)}><ClipboardCheck size={14}/>{item.category==='retainers'?'Generate monthly tasks':'Apply checklist to project'}</button>}{item.category==='retainers'&&item.cycle!==today().slice(0,7)&&<button className="btn btn-subtle btn-sm" onClick={()=>startNewCycle(item)}>Prepare current month</button>}{item.category==='proposals'&&item.status==='Accepted'&&<button className="btn btn-subtle btn-sm" onClick={()=>preparePayment(item)}>Prepare payment reference</button>}{(item.category==='invoices'||item.category==='proposals')&&<button className="btn btn-subtle btn-sm" onClick={()=>printBusinessDocument(item,data)}><Download size={14}/>Print / save PDF</button>}</div>
        </article>)}</div>
      </section>
    </div>
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><div className="ops-editor" role="dialog" aria-modal="true" aria-label="Edit agency record" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{OPS_CONFIG[editing.category].name.toUpperCase()}</span><h2>{editing.title||'New record'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setEditing(null)}><X size={18}/></button></div><div className="ops-editor-body">
      <label className="field"><span>Title *</span><input value={editing.title} onChange={e=>change('title',e.target.value)} placeholder="Name, subject or reference"/></label>
      <div className="field-grid"><label className="field"><span>Client</span><select value={editing.clientId} onChange={e=>{change('clientId',e.target.value);setEditing(prev=>prev?{...prev,clientId:e.target.value,projectId:(data.projects||[]).find(p=>p.id===prev.projectId)?.clientId===e.target.value?prev.projectId:''}:null)}}><option value="">General / no client</option>{data.clients.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Project</span><select value={editing.projectId} onChange={e=>{const p=(data.projects||[]).find(p=>p.id===e.target.value);setEditing(prev=>prev?{...prev,projectId:e.target.value,clientId:p?.clientId||prev.clientId}:null)}}><option value="">No specific project</option>{(data.projects||[]).filter(p=>!editing.clientId||p.clientId===editing.clientId).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div>
      <div className="field-grid"><label className="field"><span>Status</span><select disabled={editing.category==='invoices'&&(editing.paymentSource==='stripe'||!!editing.stripePaymentId)} value={editing.status} onChange={e=>change('status',e.target.value)}>{OPS_CONFIG[editing.category].statuses.map(s=><option key={s}>{s}</option>)}</select></label><label className="field"><span>{editing.category==='renewals'?'Agreement end / notice deadline':editing.category==='bookings'?'Meeting date':editing.category==='retainers'?'Monthly due day (anchor date)':'Follow-up / due date'}</span><input type="date" value={editing.dueDate} onChange={e=>change('dueDate',e.target.value)}/></label></div>
      {(editing.category==='invoices'||editing.category==='proposals'||editing.category==='retainers'||editing.category==='renewals')&&<div className="field-grid"><label className="field"><span>Amount</span><input type="number" min="0" step="0.01" value={editing.amount??''} onChange={e=>change('amount',e.target.value?Number(e.target.value):null)}/></label><label className="field"><span>Currency</span><select value={editing.currency} onChange={e=>change('currency',e.target.value)}><option>DKK</option><option>EUR</option><option>USD</option></select></label></div>}
      {editing.category==='proposals'&&<div className="field-grid"><label className="field"><span>Agreement type</span><select value={editing.dealType||'One-off'} onChange={e=>change('dealType',e.target.value)}><option>One-off</option><option>Retainer</option><option>Revenue Share</option><option>Other</option></select></label><label className="field"><span>Agreement end date (optional)</span><input type="date" value={editing.agreementEnd||''} onChange={e=>change('agreementEnd',e.target.value)}/></label></div>}{editing.category==='proposals'&&editing.leadId&&<p className="setting-hint">Accepting this proposal prepares its client, project and onboarding once. An end date adds one renewal record. It never records a payment.</p>}
      {editing.category==='invoices'&&<label className="field"><span>VAT (%) — optional, applied on top of the invoice amount</span><input type="number" min="0" max="100" step="0.01" value={editing.vatRate??''} onChange={e=>change('vatRate',e.target.value===''?undefined:Number(e.target.value))}/>{editing.amount!=null&&<small>Checkout total: {formatMoney(Math.round(editing.amount*(1+Number(editing.vatRate||0)/100)*100)/100,editing.currency)}</small>}</label>}
      <label className="field"><span>{editing.category==='invoices'?'External payment / invoice URL':editing.category==='accounts'?'Dashboard URL (no passwords)':editing.category==='documents'?'Secure document reference URL':'Reference URL (optional)'}</span><input type="url" value={editing.url} onChange={e=>change('url',e.target.value)} placeholder="https://..."/></label>
      {editing.checklist.length>0&&<div className="ops-checklist-editor"><h3>Checklist</h3>{editing.checklist.map(task=><div key={task.id} className="ops-checklist-item"><input type="checkbox" checked={task.done} onChange={()=>change('checklist',editing.checklist.map(t=>t.id===task.id?{...t,done:!t.done}:t))}/><input aria-label="Checklist step" value={task.label} onChange={e=>change('checklist',editing.checklist.map(t=>t.id===task.id?{...t,label:e.target.value}:t))}/><button aria-label="Remove step" onClick={()=>change('checklist',editing.checklist.filter(t=>t.id!==task.id))}><X size={14}/></button></div>)}</div>}
      <div className="ops-new-check"><input value={newChecklist} onChange={e=>setNewChecklist(e.target.value)} placeholder="Add a checklist step..."/><button className="btn btn-subtle btn-sm" type="button" onClick={()=>{if(!newChecklist.trim())return;change('checklist',[...editing.checklist,{id:uid(),label:newChecklist.trim(),done:false}]);setNewChecklist('')}}><Plus size={14}/>Add step</button></div>
      {editing.category==='reports'&&<button className="btn btn-subtle" disabled={!editing.projectId} onClick={makeProgressReport}><FileText size={15}/>Draft update from project tasks</button>}
      <label className="field"><span>{editing.category==='reports'?'Client update / message':'Notes / scope / description'}</span><textarea rows={editing.category==='reports'?11:5} value={editing.details} onChange={e=>change('details',e.target.value)} placeholder="Add the information needed for this record..."/></label>
      {editing.category==='reports'&&editing.details.trim()&&<button className="btn btn-subtle" onClick={()=>{navigator.clipboard.writeText(editing.details).then(()=>setCopied(true)).catch(()=>setError('Copy failed; select the text manually.'))}}><Copy size={14}/>{copied?'Copied':'Copy draft'}</button>}
      {['onboarding','bookings','proposals','qa','handovers','reports','documents'].includes(editing.category)&&<div className="ops-disclaimer"><strong>Client self-service link</strong><p>Creates a single-use, 14-day HTTPS link. The recipient can submit an intake, request a call, or send approval feedback. Requires the optional public-client-links.sql and server configuration.</p><button className="btn btn-subtle btn-sm" type="button" disabled={linkBusy||!db||!session||!syncReady} onClick={()=>void createPublicLink(editing)}><Link2 size={14}/>Create secure public link</button>{sharedLink&&<div style={{marginTop:12,overflowWrap:'anywhere'}}><a href={sharedLink} target="_blank" rel="noopener noreferrer">{sharedLink}</a><button className="btn btn-subtle btn-sm" onClick={()=>navigator.clipboard.writeText(sharedLink).catch(()=>setError('Copy failed'))}><Copy size={14}/>Copy</button></div>}</div>}
      {editing.category==='invoices'&&<div className="ops-disclaimer"><strong>Stripe Checkout</strong><p>Generate a real secure checkout URL using the saved invoice and your server-side Stripe credentials. Paid status is recorded only after Stripe webhook verification.</p><button type="button" className="btn btn-subtle btn-sm" disabled={!db||!session||stripeBusy||!syncReady} onClick={()=>void createStripeCheckout(editing)}><CircleDollarSign size={14}/>Create Stripe checkout</button></div>}
      {editing.category==='invoices'&&<div className="ops-disclaimer">{editing.paymentSource==='stripe'?'Verified Stripe payment · payment fields are read-only.':'Manual invoice reference. A manual Paid status does not create collected revenue. Link a Stripe invoice or use Checkout for verified receipts.'}</div>}
      {editing.category==='accounts'&&<div className="ops-disclaimer">Never save passwords, recovery codes, access tokens or private authentication links here.</div>}
      {error&&<p className="ops-error">{error}</p>}
      </div><footer className="modal-footer"><button className="btn btn-subtle" onClick={()=>remove(editing)}><Trash2 size={15}/>Delete</button><span className="flex-grow"/><button className="btn btn-subtle" onClick={()=>setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={15}/>Save record</button></footer></div></div>}
  </div>
}
