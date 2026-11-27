import strategyScaleIcon from './assets/strategy-scale-icon.png'
import ProjectHub, { ClientHub } from './ProjectHub'
import ProjectEditor from './ProjectEditor'
import FocusPage from './FocusPage'
import WorkspaceHealth from './WorkspaceHealth'
import OperationsPage from './OperationsPage'
import AutomationCenter from './AutomationCenter'
import {mergeEditedRecord} from './edit-record'
import ProjectAgreements from './ProjectAgreements'
import {useWorkspace} from './useWorkspace'
import SyncNotice from './SyncNotice'
import {activeStatistics,isActiveProject,LEAD_SOURCES} from './agency-rules'
import {dailyMessage} from './daily-message'
import {convertLeadWorkspace,prepareProposal,setTaskDone} from './workflow'
import InsightsPage from './InsightsPage'
import {applyAutomations} from './automation-engine'
import ClientHealth from './ClientHealth'
import {parseCsv,encodeCsv} from './csv'
import {diffWorkspace} from './relational'
import {auditWorkspaceBackup} from './backup-audit'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays,
  Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  Clock3, Cloud, Command, Download, ExternalLink, FileText, Filter, FolderKanban,
  Handshake, HardDrive, Inbox, LayoutDashboard, LockKeyhole, LogOut, Menu, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Upload, Users,
  Wallet, X, AlertCircle, CalendarClock, Circle, GripVertical, Link2, Mail, Phone,
  ListTodo, BarChart3, RefreshCcw, Save, SlidersHorizontal, ChevronUp, Sun, Boxes
} from 'lucide-react'
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { Client, Project, Lead, Task, Transaction, Workspace, RecordKind, ClientStatus, LeadStage, Currency } from './types'
import { clientStatuses, leadStages, priorities, dealTypes, currencies, services } from './types'
import { starterWorkspace, emptyWorkspace, defaultClient, defaultLead, defaultTask, defaultTransaction, defaultProject, upgradeWorkspace, uid, today, formatDate, money, shortMoney, formatMoney, isOverdue, validateWorkspace } from './data'

type Page = 'overview' | 'focus' | 'projects' | 'pipeline' | 'tasks' | 'operations' | 'finance' | 'insights' | 'settings'
const NAV_PAGES: Page[] = ['overview', 'focus', 'projects', 'pipeline', 'tasks', 'operations', 'finance', 'insights']
type Dialog = { kind: RecordKind; id?: string; stage?: ClientStatus; clientId?: string; projectId?: string } | null
type HubSelection = { type: 'project' | 'client'; id: string } | null
type ProjectDialog = { id?: string; clientId?: string; stage?: ClientStatus } | null
const STORAGE_KEY = 'paid-hustlee-workspace-v1'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY)
const invalidUrl = Boolean(cloudEnabled && !/^https:\/\/[^\s]+\.supabase\.co\/?$/.test(SUPABASE_URL?.trim()||''))
// Misconfiguration must never silently downgrade a private cloud app to a public preview.
const db = cloudEnabled && !invalidUrl ? createClient(SUPABASE_URL!, SUPABASE_KEY!) : null

const icons: Record<Page, typeof LayoutDashboard> = {
  overview: LayoutDashboard, focus: Sun, projects: FolderKanban, pipeline: Target, tasks: ListTodo, operations: Boxes, finance: Wallet, insights: TrendingUp, settings: Settings2
}
const pageNames: Record<Page, string> = {
  overview: 'Home', focus: "Today's Focus", projects: 'Clients & projects', pipeline: 'Sales', tasks: 'Tasks', operations: 'Agency tools', finance: 'Finances', insights: 'Insights', settings: 'Settings'
}
const statusColor: Record<string, string> = {
  'Onboarding': 'amber', 'In Progress': 'blue', 'Client Review': 'orange', 'Revisions': 'purple', 'Completed': 'green',
  'Active Retainer': 'teal', 'Lead': 'rose', 'Outreached': 'amber', 'Qualified': 'orange', 'Meeting Booked': 'blue',
  'Proposal Sent': 'purple', 'Negotiation': 'amber', 'Closed Won': 'green', 'Lost': 'gray',
  'Low': 'gray', 'Medium': 'amber', 'High': 'rose', 'Paid': 'green', 'Pending': 'amber'
}
function Badge({ children, tone, dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return <span className={`badge badge-${tone || 'gray'}`}>{dot && <i className="badge-dot" />}{children}</span>
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section> }
function IconButton({ onClick, title, children, className = '' }: { onClick: () => void; title: string; children: ReactNode; className?: string }) {
  return <button type="button" className={`icon-button ${className}`} title={title} aria-label={title} onClick={onClick}>{children}</button>
}
function Empty({ icon: Icon = Inbox, title, description, action, onAction }: { icon?: typeof Inbox, title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty"><div className="empty-symbol"><Icon size={23}/></div><strong>{title}</strong><span>{description}</span>{action && onAction && <button className="btn btn-subtle btn-sm" onClick={onAction}><Plus size={14}/>{action}</button>}</div>
}
function formatDateShort(date: string) { return date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date' }

/** Project cards are a fast, read-only summary. Editing happens inside the command center. */
function ProjectBoardCard({project, clientName, transactions, onOpen}: {
  project: Project
  clientName: string
  transactions: Transaction[]
  onOpen: () => void
}) {
  // Only show payment states supported by saved income transactions.
  // Older one-project-per-client records had transactions without project IDs.
  const linkedIncome = transactions.filter(t => t.kind === 'Income' && (
    t.projectId === project.id ||
    (project.id.startsWith('legacy-') && !t.projectId && t.clientId === project.clientId)
  ))
  const hasPaid = linkedIncome.some(t => t.status === 'Paid')
  const hasPending = linkedIncome.some(t => t.status === 'Pending')
  const paymentStatus = hasPaid && hasPending ? 'Part-paid' : hasPending ? 'Awaiting payment' : hasPaid ? 'Payment recorded' : ''
  const paymentTone = hasPending ? 'amber' : 'green'
  const visibleServices = project.services.slice(0, 2)
  const hiddenServices = Math.max(0, project.services.length - visibleServices.length)
  const showDeal = Boolean(project.dealType && project.dealType !== 'Other') || project.dealValue != null || (project.dealType === 'Revenue Share' && project.revenueSharePercent != null)

  return <div
    className="kanban-card modern-project-card"
    draggable
    onDragStart={e => e.dataTransfer.setData('application/paid-hustle-project', project.id)}
    onClick={onOpen}
    role="button"
    aria-label={`Open ${project.name} project for ${clientName}`}
    tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
  >
    <div className="project-card-header">
      <span className="project-card-icon"><FolderKanban size={15}/></span>
      <span className="project-card-heading"><strong title={project.name}>{project.name}</strong><small title={clientName}>{clientName}</small></span>
      <ArrowUpRight className="project-card-open" size={16} aria-hidden="true"/>
    </div>
    <div className="project-card-chips">
      <Badge tone={statusColor[project.priority]}>{project.priority}</Badge>
      {visibleServices.map(service => <span className="service-tag" key={service} title={service}>{service}</span>)}
      {hiddenServices > 0 && <span className="project-more-services" title={project.services.join(', ')}>+{hiddenServices} more</span>}
    </div>
    {showDeal && <div className="project-card-deal">
      {project.dealType && project.dealType !== 'Other' && <span className="project-deal-type">{project.dealType}</span>}
      {project.dealType === 'Revenue Share' && project.revenueSharePercent != null && <span className="project-revenue-share">{project.revenueSharePercent}% share</span>}
      {project.dealValue != null && <strong className="project-deal-value" title="Recorded deal value in its original currency">{formatMoney(project.dealValue, project.currency || 'DKK')}</strong>}
    </div>}
    {paymentStatus && <div className={`project-payment-state project-payment-${paymentTone}`}>
      <CircleDollarSign size={13} aria-hidden="true"/>{paymentStatus}
    </div>}
    {(project.deadline || project.nextFollowUp) && <div className="project-card-dates">
      {project.deadline && <div className={`project-card-date ${isOverdue(project.deadline) && project.status !== 'Completed' ? 'project-date-overdue' : ''}`}>
        <CalendarDays size={13} aria-hidden="true"/><span>Deadline</span><strong>{formatDate(project.deadline)}</strong>
      </div>}
      {project.nextFollowUp && <div className={`project-card-date ${isOverdue(project.nextFollowUp) ? 'project-date-overdue' : ''}`}>
        <CalendarClock size={13} aria-hidden="true"/><span>Follow-up</span><strong>{formatDate(project.nextFollowUp)}</strong>
      </div>}
    </div>}
    {project.nextAction?.trim() && <div className="project-card-next">
      <span>Next action</span><p title={project.nextAction}>{project.nextAction}</p>
    </div>}
  </div>
}
function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!db) return
    setLoading(true); setError('')
    const result = await db.auth.signInWithPassword({ email, password })
    if (result.error) setError(result.error.message)
    setLoading(false)
  }
  return <div className="login-screen"><div className="login-glow"/><div className="login-card">
    <div className="login-logo"><img src={strategyScaleIcon} alt="Strategy Scale icon" /></div>
    <Badge tone="teal"><LockKeyhole size={12}/> PRIVATE WORKSPACE</Badge>
    <h1>Welcome back.</h1><p>Your business, beautifully organized. Sign in to your Strategy Scale workspace.</p>
    <form onSubmit={login} className="login-form"><label>Email address<input autoComplete="email" type="email" placeholder="you@agency.com" value={email} required onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" placeholder="Your password" value={password} required onChange={e => setPassword(e.target.value)}/></label>
    {error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}
    <button className="btn btn-primary login-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to workspace'}<ArrowRight size={17}/></button></form>
    <div className="login-foot"><ShieldCheck size={16}/>Protected by Supabase Authentication</div>
  </div></div>
}

interface EditorProps {
  kind: RecordKind
  item: Client | Lead | Task | Transaction
  clients: Client[]
  projects: Project[]
  onClose: () => void
  onSave: (kind: RecordKind, item: Client | Lead | Task | Transaction) => void
  onDelete: (kind: RecordKind, id: string) => void
  onConvertLead: (lead: Lead) => void
  onPrepareProposal: (lead:Lead)=>void
  isNew: boolean
  leadStageOptions: string[]
}
function Editor({ kind, item, clients, projects, onClose, onSave, onDelete, onConvertLead, onPrepareProposal, isNew, leadStageOptions }: EditorProps) {
  const [form, setForm] = useState<Client | Lead | Task | Transaction>(item)
  const original=useRef(item)
  const [error, setError] = useState('')
  const [customSource,setCustomSource]=useState(kind==='lead'&&!!(item as Lead).source&&!LEAD_SOURCES.includes((item as Lead).source))
  const [customService, setCustomService] = useState('')
  const [newSubtask,setNewSubtask]=useState('')
  const [advancedOpen, setAdvancedOpen] = useState(!isNew)
  const update = (field: string, value: unknown) => setForm(v => ({ ...v, [field]: value }) as typeof v)
  const labels: Record<RecordKind, string> = { client: 'client', lead: 'lead', task: 'task', transaction: 'transaction' }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (kind === 'client' && !(form as Client).name.trim()) { setError('Client name is required'); return }
    if (kind === 'lead' && !(form as Lead).company.trim()) { setError('Company name is required'); return }
    if (kind === 'task' && !(form as Task).title.trim()) { setError('Task title is required'); return }
    if (kind === 'transaction' && (!(form as Transaction).description.trim() || !Number.isFinite((form as Transaction).amount) || (form as Transaction).amount <= 0)) { setError('Add a description and an amount greater than zero'); return }
    try{onSave(kind,mergeEditedRecord(original.current,form,item))}catch(e){setError(e instanceof Error?e.message:'Unable to apply changes')}
  }
  const input = (label: string, key: string, placeholder = '', type = 'text') => <label className="field"><span>{label}</span><input type={type} value={String((form as unknown as Record<string, unknown>)[key] ?? '')} placeholder={placeholder} onChange={e => update(key, e.target.value)}/></label>
  const select = (label: string, key: string, options: string[]) => <label className="field"><span>{label}</span><select value={String((form as unknown as Record<string, unknown>)[key] ?? '')} onChange={e => update(key, e.target.value)}>{options.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
  const amount = (label: string, key: 'dealValue'|'value'|'amount') => <label className="field"><span>{label} ({'currency' in form ? form.currency || 'DKK' : 'DKK'})</span><input type="number" min="0" step="0.01" placeholder="0" value={String((form as unknown as Record<string, unknown>)[key] ?? '')} onChange={e => update(key, e.target.value === '' ? (key === 'amount' ? 0 : null) : Number(e.target.value))}/></label>
  const clientSelect = (key: string) => <label className="field"><span>Related client</span><select value={String((form as unknown as Record<string, unknown>)[key] ?? '')} onChange={e => setForm(prev=>({...prev,[key]:e.target.value,projectId:(prev as Task).projectId&&projects.find(p=>p.id===(prev as Task).projectId)?.clientId!==e.target.value?'':(prev as Task).projectId}) as typeof prev)}><option value="">None</option>{clients.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
  const projectSelect = () => <label className="field"><span>Related project (optional)</span><select value={String((form as Task).projectId || '')} onChange={e=>{const project=projects.find(p=>p.id===e.target.value);setForm(prev=>({...prev,projectId:e.target.value,clientId:project?.clientId||(prev as Task).clientId}) as typeof prev)}}><option value="">No specific project</option>{projects.filter(p=>!form || !(form as Task).clientId || p.clientId===(form as Task).clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  const serviceSelector = () => {const selected=(form as Lead).services||[];return <><div className="service-picker">{services.map(name=><button key={name} type="button" className={selected.includes(name)?'selected':''} onClick={()=>update('services',selected.includes(name)?selected.filter(s=>s!==name):[...selected,name])}>{selected.includes(name)&&<Check size={13}/>} {name}</button>)}{selected.filter(name=>!services.includes(name)).map(name=><button type="button" className="selected" key={name} onClick={()=>update('services',selected.filter(s=>s!==name))}><Check size={13}/> {name}</button>)}</div><div className="hub-inline-add"><input aria-label="Custom service" value={customService} onChange={e=>setCustomService(e.target.value)} placeholder="Other service..."/><button type="button" className="btn btn-sm btn-subtle" onClick={()=>{if(customService.trim()&&!selected.includes(customService.trim()))update('services',[...selected,customService.trim()]);setCustomService('')}}>Add</button></div></>}

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={`${isNew ? 'Add' : 'Edit'} ${labels[kind]}`}>
      <header className="modal-head"><div><span className="eyebrow">WORKSPACE / {labels[kind].toUpperCase()}</span><h2>{isNew ? 'Add new' : 'Edit'} {labels[kind]}</h2></div><IconButton onClick={onClose} title="Close"><X size={19}/></IconButton></header>
      <form onSubmit={submit}><div className="modal-body">
      {kind === 'client' && (() => { const c = form as Client; return <>
        {input('Client / company name *', 'name', 'e.g. Acme Studio')}
        <p className="editor-caption">Add a client once. Give them as many separate project workspaces as you need.</p>
        <button className="editor-expand" type="button" onClick={()=>setAdvancedOpen(v=>!v)}>{advancedOpen?'− Hide':'＋ Add'} contact details and references <ChevronDown size={16}/></button>
        {advancedOpen&&<><div className="separator-label">CLIENT CONTACT</div><div className="field-grid">{input('Contact person','contact','Name')}{input('Email','email','email@company.com','email')}</div>
        <div className="field-grid">{input('Phone / WhatsApp','phone','+45 …','tel')}{input('Company website','websiteUrl','https://…','url')}</div>
        {input('Client folder','folderUrl','https://drive.google.com/...','url')}
        <label className="field"><span>Relationship notes</span><textarea rows={4} value={c.notes||''} onChange={e=>update('notes',e.target.value)} placeholder="Communication preferences, context, background..."/></label></>}
      </> })()}
      {kind === 'lead' && <>
        <div className="field-grid">{input('Company / lead name *','company','e.g. New prospect')}{select('Pipeline stage','stage',leadStageOptions)}</div>
        <div className="field-grid">{input('Contact person','contact','Name')}{input('Contact email','email','email@company.com','email')}</div>
        <div className="field-grid">{input('Phone / WhatsApp','phone','+45 ...','tel')}<label className="field"><span>Lead source</span><select value={customSource?'Other':(form as Lead).source||''} onChange={e=>{setCustomSource(e.target.value==='Other');update('source',e.target.value==='Other'?'':e.target.value)}}><option value="">Select source</option>{LEAD_SOURCES.map(v=><option key={v}>{v}</option>)}<option>Other</option></select>{customSource&&<input aria-label="Custom lead source" placeholder="Enter source" value={(form as Lead).source||''} onChange={e=>update('source',e.target.value)}/>}</label></div>
        <div className="separator-label">SERVICES THEY NEED</div>{serviceSelector()}
        <div className="separator-label">OPPORTUNITY</div>
        <div className="field-grid">{amount('Estimated deal value','value')}{select('Deal currency','currency',currencies)}</div>
        {input('Next action','nextAction','Send proposal, book discovery call...')}
        <div className="field-grid">{input('Last contacted','lastContact','','date')}{input('Next follow-up','followUp','','date')}</div>
        {(form as Lead).stage==='Lost'&&<div className="field-grid">{select('Reason deal was lost','lostReason',['Not recorded','Budget / price','Not ready yet','No response','Chose another provider','Not the right fit','Other'])}</div>}
      </>}
      {kind === 'task' && <>
        {input('Task name','title','What needs to get done?')}
        <div className="field-grid">{clientSelect('clientId')}{projectSelect()}</div><div className="field-grid">{select('Priority','priority',priorities)}</div>
        <div className="field-grid">{input('Due date','dueDate','','date')}<label className="field"><span>Status</span><select value={String((form as Task).done)} onChange={e => update('done', e.target.value === 'true')}><option value="false">Not done</option><option value="true">Done</option></select></label></div>
        <div className="ops-checklist-editor"><h3>Subtasks</h3>{((form as Task).subtasks||[]).map(sub=><div className="ops-checklist-item" key={sub.id}><input type="checkbox" checked={sub.done} onChange={()=>update('subtasks',((form as Task).subtasks||[]).map(x=>x.id===sub.id?{...x,done:!x.done}:x))}/><input aria-label="Subtask title" value={sub.title} onChange={e=>update('subtasks',((form as Task).subtasks||[]).map(x=>x.id===sub.id?{...x,title:e.target.value}:x))}/><button type="button" aria-label="Remove subtask" onClick={()=>update('subtasks',((form as Task).subtasks||[]).filter(x=>x.id!==sub.id))}><X size={14}/></button></div>)}<div className="ops-new-check"><input value={newSubtask} onChange={e=>setNewSubtask(e.target.value)} placeholder="Next step..."/><button className="btn btn-subtle btn-sm" type="button" onClick={()=>{if(!newSubtask.trim())return;update('subtasks',[...((form as Task).subtasks||[]),{id:uid(),title:newSubtask.trim(),done:false}]);setNewSubtask('')}}><Plus size={14}/>Add</button></div></div>
      </>}
      {kind === 'transaction' && <>
        {input('Description','description','e.g. October retainer')}
        <div className="field-grid">{amount('Amount','amount')}{select('Original transaction currency','currency',currencies)}</div><div className="field-grid">{clientSelect('clientId')}{projectSelect()}</div>
        <div className="field-grid">{select('Transaction type','kind',['Income','Expense'])}{select('Payment status','status',['Paid','Pending'])}</div>
        {input('Payment / due date','date','','date')}
      </>}
      {kind!=='client'&&<label className="field"><span>Notes</span><textarea rows={4} placeholder="Anything important to remember…" value={String((form as Client).notes ?? '')} onChange={e => update('notes', e.target.value)}/></label>}
      {error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}
      </div><footer className="modal-footer">
        {kind==='lead'&&!isNew&&<button type="button" className="btn btn-subtle" onClick={()=>onPrepareProposal(form as Lead)}>Prepare proposal</button>}{kind === 'lead' && !isNew && <button type="button" className="btn btn-subtle" onClick={() => onConvertLead(form as Lead)}><Handshake size={15}/>Convert to client</button>}
        {!isNew && <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm(`Delete this ${labels[kind]}? This cannot be undone.`)) onDelete(kind, item.id) }}><Trash2 size={16}/>Delete</button>}
        <span className="flex-grow"/><button type="button" className="btn btn-subtle" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16}/>{isNew ? 'Create' : 'Save changes'}</button>
      </footer></form>
    </div>
  </div>
}

export default function App() {
  const { workspace: data, setWorkspace: setData, session, authLoading, loaded, sync, syncError, retrySync, conflicts, resolveConflicts } = useWorkspace(db,cloudEnabled)
  const [calendarDay,setCalendarDay]=useState(today())
  useEffect(()=>{const id=setInterval(()=>setCalendarDay(today()),15000);return()=>clearInterval(id)},[])
  const [page, setPage] = useState<Page>('overview')
  const [moreToolsOpen, setMoreToolsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  // Automatically run safe, idempotent in-app rules on login and on relevant changes.
  // External side effects (email and payments) are never triggered here.
  useEffect(()=>{
    if(!loaded||sync==='error'||sync==='conflict')return
    const planned=applyAutomations(data,today())
    if(planned.descriptions.length)setData(prev=>applyAutomations(prev,today()).workspace)
  },[loaded,data,sync,setData,calendarDay])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState<'board'|'list'|'clients'>('board')
  const [hub, setHub] = useState<HubSelection>(null)
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null)
  const [operationJump,setOperationJump]=useState<{id:string;nonce:string}|null>(null)
  const [rates, setRates] = useState<{date:string;EUR:number;USD:number}|null>(()=>{try{const saved=localStorage.getItem('paid-hustle-fx-cache');if(saved){const obj=JSON.parse(saved);if(obj&&Number.isFinite(obj.EUR)&&Number.isFinite(obj.USD)&&typeof obj.date==='string')return obj}}catch{}return null})
  const [ratesError, setRatesError] = useState(false)
  useEffect(()=>{let active=true;fetch('https://api.frankfurter.dev/v1/latest?base=DKK&symbols=EUR,USD').then(r=>{if(!r.ok)throw new Error('Exchange rates unavailable');return r.json()}).then(payload=>{if(!active)return;if(!Number.isFinite(payload.rates?.EUR)||!Number.isFinite(payload.rates?.USD))throw new Error('Invalid exchange rates');const value={date:String(payload.date),EUR:payload.rates.EUR,USD:payload.rates.USD};setRates(value);localStorage.setItem('paid-hustle-fx-cache',JSON.stringify(value));setRatesError(false)}).catch(()=>{if(active)setRatesError(true)});return()=>{active=false}},[])
  const [taskFilter, setTaskFilter] = useState<'open'|'all'|'completed'>('open')
  const [selectedTaskIds,setSelectedTaskIds] = useState<string[]>([])
  const [taskPriorityFilter,setTaskPriorityFilter]=useState<'all'|'High'|'Medium'|'Low'>('all')
  const [financeFilter, setFinanceFilter] = useState<'all'|'income'|'pending'|'expense'>('all')
  const [financePeriod, setFinancePeriod] = useState<'all'|'30'|'90'|'365'>('all')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [newSalesStage,setNewSalesStage] = useState('')
  const [newProjectStage,setNewProjectStage] = useState('')
  const [backupHistory,setBackupHistory] = useState<{id:string;backup_day:string;captured_at:string}[]>([])
  const [backupStatus,setBackupStatus] = useState('')
  useEffect(()=>{
    if(!db||!session||page!=='settings') return
    let active=true
    db.from('agency_backups').select('id,backup_day,captured_at').order('captured_at',{ascending:false}).limit(30).then(({data:rows,error})=>{
      if(!active)return
      if(error){setBackupStatus('Scheduled cloud backup history is not configured yet.');setBackupHistory([])}
      else {setBackupHistory(rows||[]);setBackupStatus('')}
    })
    return ()=>{active=false}
  },[page,session?.user.id])
  const downloadCloudBackup = async (id:string) => {
    if(!db) return
    const {data:row,error}=await db.from('agency_backups').select('snapshot').eq('id',id).single()
    if(error||!row?.snapshot){setBackupStatus('Unable to retrieve this backup.');return}
    const blob=new Blob([JSON.stringify(row.snapshot,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a')
    anchor.href=url;anchor.download=`paid-hustle-cloud-backup-${today()}.json`;anchor.click()
    window.setTimeout(()=>URL.revokeObjectURL(url),1500)
    setToast('Cloud backup downloaded')
  }

  const restoreCloudBackup = async (id:string)=>{
    if(!db)return
    const {data:row,error}=await db.from('agency_backups').select('snapshot').eq('id',id).single()
    if(error||!row?.snapshot){setBackupStatus('This snapshot could not be read.');return}
    const snapshot:unknown=row.snapshot
    if(!validateWorkspace(snapshot)){setBackupStatus('This snapshot failed validation; no records changed.');return}
    const restored=upgradeWorkspace(snapshot)
    const audit=auditWorkspaceBackup(restored)
    if(audit.errors.length){setBackupStatus('Backup has invalid or broken references; restore blocked.');return}
    const before=auditWorkspaceBackup(data).counts,after=audit.counts
    if(!confirm(`Restore this server backup?\n\nCurrent: ${before.clients} clients, ${before.projects} projects, ${before.tasks} tasks.\nBackup: ${after.clients} clients, ${after.projects} projects, ${after.tasks} tasks.\n\nThis REPLACES current workspace data. Export current data first.`))return
    if(!confirm('Final confirmation: replace the current records with this cloud snapshot?'))return
    setData(restored)
    setToast('Cloud snapshot accepted. Wait for the cloud sync to say Saved before refreshing.')
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const hiddenWidgets = data.preferences.hiddenDashboardWidgets || []
  const navOrder = [...new Set([...(data.preferences.navOrder || []).filter(name => NAV_PAGES.includes(name as Page)), ...NAV_PAGES])] as Page[]
  const hiddenPages = data.preferences.hiddenPages || []
  const salesPipeline = [...new Set([...(data.preferences.leadStages || leadStages), ...data.leads.map(l=>l.stage)])]
  const projectPipeline = [...new Set([...(data.preferences.projectStages || clientStatuses), ...(data.projects||[]).map(p=>p.status)])]
  const updatePageVisibility = (name: Page, visible: boolean) => setData(prev => ({...prev, preferences: {...prev.preferences, hiddenPages: visible ? (prev.preferences.hiddenPages || []).filter(p => p !== name) : [...new Set([...(prev.preferences.hiddenPages || []), name])]}}))
  const addPipelineStage = (kind:'lead'|'project') => {
    const name=(kind==='lead'?newSalesStage:newProjectStage).trim()
    const stages=kind==='lead'?salesPipeline:projectPipeline
    if (!name||name.length>48||stages.some(s=>s.toLowerCase()===name.toLowerCase())) { setToast('Enter a unique stage name (up to 48 characters)');return }
    setData(prev=>({...prev,preferences:{...prev.preferences,[kind==='lead'?'leadStages':'projectStages']:[...stages,name]}}))
    kind==='lead'?setNewSalesStage(''):setNewProjectStage('')
  }
  const movePipelineStage = (kind:'lead'|'project',stage:string,delta:number) => {
    const stages=[...(kind==='lead'?salesPipeline:projectPipeline)]
    const index=stages.indexOf(stage),target=index+delta
    if(target<0||target>=stages.length)return
    ;[stages[index],stages[target]]=[stages[target],stages[index]]
    setData(prev=>({...prev,preferences:{...prev.preferences,[kind==='lead'?'leadStages':'projectStages']:stages}}))
  }
  const deletePipelineStage = (kind:'lead'|'project',stage:string) => {
    if((kind==='lead'&&data.leads.some(l=>l.stage===stage))||(kind==='project'&&(data.projects||[]).some(p=>p.status===stage))){setToast('Move existing records out of this stage before removing it');return}
    if((kind==='lead'&&['Closed Won','Lost'].includes(stage))||(kind==='project'&&stage==='Completed')){setToast('This system stage cannot be removed');return}
    const stages=(kind==='lead'?salesPipeline:projectPipeline).filter(s=>s!==stage)
    setData(prev=>({...prev,preferences:{...prev.preferences,[kind==='lead'?'leadStages':'projectStages']:stages}}))
  }
  const moveNavPage = (name: Page, direction: -1 | 1) => {
    const next = [...navOrder]
    const index = next.indexOf(name)
    const target = index + direction
    if (index < 0 || target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setData(prev => ({ ...prev, preferences: { ...prev.preferences, navOrder: next } }))
  }
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); searchInput.current?.focus() }
      if (e.key === 'Escape') { setDialog(null); setProjectDialog(null); setSearchOpen(false); setMobileOpen(false) }
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 3400); return () => window.clearTimeout(id) }, [toast])

  const projects = (data.projects || []).filter(p=>!p.archivedAt)
  const getClient = (id: string) => data.clients.find(c => c.id === id)
  const getProject = (id: string) => (data.projects||[]).find(p => p.id === id)
  const openClient = (id:string) => {setHub({type:'client',id});setPage('projects');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'})}
  const openProject = (id:string) => {setHub({type:'project',id});setPage('projects');setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'})}
  const displayCurrency:Currency = data.preferences?.currency || 'DKK'
  const converted = (value:number, source:Currency='DKK', target:Currency=displayCurrency):number => {
    if(source===target)return value
    if(!rates)return Number.NaN
    const base=source==='DKK'?value:value/rates[source]
    return target==='DKK'?base:base*rates[target]
  }
  const money = (value:number, source:Currency='DKK') => {const amount=converted(value,source);return Number.isFinite(amount)?formatMoney(amount,displayCurrency):'FX unavailable'}
  const shortMoney = (value:number) => {if(!Number.isFinite(value))return 'FX unavailable';const v=converted(value,'DKK');if(!Number.isFinite(v))return 'FX unavailable';return Math.abs(v)>=1000000?`${(v/1000000).toFixed(1)}m ${displayCurrency}`:Math.abs(v)>=10000?`${(v/1000).toFixed(1)}k ${displayCurrency}`:formatMoney(v,displayCurrency)}
  const sumBase = (items:Transaction[]) => items.reduce((acc,t)=>acc+converted(Number(t.amount),t.currency||'DKK','DKK'),0)
  const setCurrency = (currency:Currency)=>setData(prev=>({...prev,preferences:{...prev.preferences,currency}}))
  const updateProject = (id:string,patch:Partial<Project>,message?:string) => setData(prev=>({...prev, projects:(prev.projects||[]).map(p=>p.id===id?{...p,...patch,updatedAt:new Date().toISOString(),activity:message?[{id:uid(),text:message,at:new Date().toISOString()},...p.activity].slice(0,120):p.activity}:p)}))
  const saveProject = (project:Project) => {setData(prev=>({...prev,projects:(prev.projects||[]).some(p=>p.id===project.id)?(prev.projects||[]).map(p=>p.id===project.id?{...project,updatedAt:new Date().toISOString(),activity:[{id:uid(),text:'Project details updated',at:new Date().toISOString()},...project.activity].slice(0,120)}:p):[{...project,activity:[{id:uid(),text:'Project created',at:new Date().toISOString()},...project.activity]},...(prev.projects||[])]}));setProjectDialog(null);openProject(project.id);setToast(cloudEnabled?'Project updated · syncing changes':'Project saved in this browser')}
  const archiveProject = (id:string) => {
    if(!confirm('Archive this project? You can restore it from Settings.'))return
    setData(prev=>({...prev,projects:(prev.projects||[]).map(p=>p.id===id?{...p,archivedAt:new Date().toISOString()}:p)}))
    setHub(null);setToast('Project archived; records retained')
  }
  const archiveClient = (id:string) => {
    if(projects.some(p=>p.clientId===id)){setToast('Archive the client’s active projects first');return}
    if(!confirm('Archive this client? You can restore the record from Settings.'))return
    setData(prev=>({...prev,clients:prev.clients.map(c=>c.id===id?{...c,archivedAt:new Date().toISOString()}:c)}))
    setHub(null);setToast('Client archived; records retained')
  }
  const deleteProject = (id:string) => {archiveProject(id);setProjectDialog(null)}
  const addProject = (clientId='',stage?:ClientStatus)=>{if(!data.clients.filter(c=>!c.archivedAt).length){setDialog({kind:'client'});setToast('Add your first client before creating a project');return};setProjectDialog({clientId:clientId||(data.clients.filter(c=>!c.archivedAt).length===1?data.clients.find(c=>!c.archivedAt)!.id:''),stage})}
  const editProject = (id:string)=>setProjectDialog({id})

  const add = (kind: RecordKind, clientId?:string, projectId?:string) => setDialog({kind,clientId,projectId})
  const edit = (kind: RecordKind, id: string) => {if(kind==='transaction'&&id.startsWith('stripe:')){setToast('Verified Stripe receipt · read-only. Manage the payment in Stripe.');return}setDialog({kind,id})}
  const replaceArray = (kind: RecordKind, items: Client[] | Lead[] | Task[] | Transaction[]) => setData(prev => {
    if (kind === 'client') return { ...prev, clients: items as Client[] }
    if (kind === 'lead') return { ...prev, leads: items as Lead[] }
    if (kind === 'task') return { ...prev, tasks: items as Task[] }
    return { ...prev, transactions: items as Transaction[] }
  })
  const save = (kind: RecordKind, item: Client | Lead | Task | Transaction) => {
    setData(prev => {
      const activityLog = [{id:uid(),date:new Date().toISOString(),label:`${kind} record saved`},...(prev.activityLog||[])].slice(0,250)
      prev = {...prev,activityLog}
      if (kind === 'client') return { ...prev, clients: prev.clients.some(c => c.id === item.id) ? prev.clients.map(c => c.id === item.id ? item as Client : c) : [item as Client, ...prev.clients] }
      if (kind === 'lead') {
        const before=prev.leads.find(c=>c.id===item.id)
        const lead=item as Lead
        const history=before&&before.stage!==lead.stage?[{leadId:lead.id,from:before.stage,to:lead.stage,at:new Date().toISOString()},...(prev.preferences.leadStageHistory||[])].slice(0,500):prev.preferences.leadStageHistory
        return {...prev,preferences:{...prev.preferences,leadStageHistory:history},leads:prev.leads.some(c=>c.id===item.id)?prev.leads.map(c=>c.id===item.id?lead:c):[lead,...prev.leads]}
      }
      if (kind === 'task') {const task=item as Task;prev=setTaskDone(prev,task.id,task.done);return { ...prev, tasks: prev.tasks.some(c => c.id === item.id) ? prev.tasks.map(c => c.id === item.id ? item as Task : c) : [item as Task, ...prev.tasks] }}
      return { ...prev, transactions: prev.transactions.some(c => c.id === item.id) ? prev.transactions.map(c => c.id === item.id ? item as Transaction : c) : [item as Transaction, ...prev.transactions] }
    })
    setDialog(null); if(kind==='client')openClient(item.id);setToast(cloudEnabled?'Changes queued for cloud saving':'Changes saved in this browser')
  }
  const convertLead = (lead:Lead)=>{
    if(lead.stage==='Closed Won'&&!lead.convertedProjectId){setToast('This historical lead is already won. Open its existing client or project instead.');return}
    const next=convertLeadWorkspace({...data,leads:data.leads.map(l=>l.id===lead.id?lead:l)},lead)
    setData(next);setDialog(null);openProject(next.leads.find(l=>l.id===lead.id)?.convertedProjectId||`lead-project:${lead.id}`);setToast('Client, project and onboarding prepared')
  }
  const leadProposal=(lead:Lead)=>{
    const next=prepareProposal({...data,leads:data.leads.map(l=>l.id===lead.id?lead:l)},lead)
    setData(next.workspace);setDialog(null);setOperationJump({id:next.id,nonce:uid()});navigate('operations')
  }
  const remove = (kind: RecordKind, id: string) => {
    if(kind==='client' && (data.projects||[]).some(p=>p.clientId===id)){setToast('Move or delete this client’s projects before deleting the client');return}
    if (kind === 'client') replaceArray(kind, data.clients.filter(c => c.id !== id))
    if (kind === 'lead') replaceArray(kind, data.leads.filter(c => c.id !== id))
    if (kind === 'task') replaceArray(kind, data.tasks.filter(c => c.id !== id))
    if (kind === 'transaction') replaceArray(kind, data.transactions.filter(c => c.id !== id))
    setData(prev=>({...prev,activityLog:[{id:uid(),date:new Date().toISOString(),label:`${kind} record deleted`},...(prev.activityLog||[])].slice(0,250)}))
    setDialog(null); setToast('Record deleted')
  }
  const updateClientStage = (id: string, status: ClientStatus) => setData(prev => ({ ...prev, clients: prev.clients.map(c => c.id === id ? { ...c, status } : c) }))
  const updateLeadStage = (id: string, stage: LeadStage) => setData(prev => {
    const lead=prev.leads.find(l=>l.id===id)
    if(!lead||lead.stage===stage)return prev
    return {...prev,leads:prev.leads.map(l=>l.id===id?{...l,stage}:l),preferences:{...prev.preferences,leadStageHistory:[{leadId:id,from:lead.stage,to:stage,at:new Date().toISOString()},...(prev.preferences.leadStageHistory||[])].slice(0,500)}}
  })
  const toggleTask = (id:string)=>setData(prev=>setTaskDone(prev,id,!prev.tasks.find(t=>t.id===id)?.done))
  const bulkTasks=(action:'complete'|'reopen'|'high'|'remove')=>{
    if(!selectedTaskIds.length)return
    if(action==='remove'&&!confirm(`Delete ${selectedTaskIds.length} selected tasks? This cannot be undone.`))return
    const selected=new Set(selectedTaskIds)
    setData(prev=>{if(action==='complete'||action==='reopen'){for(const id of selected)prev=setTaskDone(prev,id,action==='complete')}return {...prev,tasks:action==='remove'?prev.tasks.filter(t=>!selected.has(t.id)):prev.tasks.map(t=>selected.has(t.id)?{...t,...(action==='high'?{priority:'High' as const}:{done:action==='complete'})}:t),activityLog:[{id:uid(),date:new Date().toISOString(),label:`Bulk ${action}: ${selected.size} tasks`},...(prev.activityLog||[])].slice(0,250)}})
    setSelectedTaskIds([])
    setToast(`${selected.size} tasks updated`)
  }
  const navigate = (target: Page) => { setHub(null);setPage(target);setQuickAddOpen(false);if(target==='operations'||target==='insights')setMoreToolsOpen(true); setMobileOpen(false); window.scrollTo({top:0, behavior:'smooth'}) }
  const paidIncome = sumBase(data.transactions.filter(t => t.kind === 'Income' && t.status === 'Paid'))
  const pendingIncome = sumBase(data.transactions.filter(t => t.kind === 'Income' && t.status === 'Pending'))
  const expenses = sumBase(data.transactions.filter(t => t.kind === 'Expense' && t.status === 'Paid'))
  const pipelineAmount = data.leads.filter(l => l.stage !== 'Closed Won' && l.stage !== 'Lost').reduce((a,b) => a+converted(b.value||0,b.currency||'DKK','DKK'), 0)
  const closedDeals = data.leads.filter(l=>l.stage==='Closed Won'||l.stage==='Lost')
  const salesWinRate = closedDeals.length?Math.round(100*closedDeals.filter(l=>l.stage==='Closed Won').length/closedDeals.length):null
  const lostDealReasons = Object.entries(data.leads.filter(l=>l.stage==='Lost').reduce<Record<string,number>>((counts,lead)=>{
    const label=lead.lostReason||'Not recorded';counts[label]=(counts[label]||0)+1;return counts
  },{})).sort((a,b)=>b[1]-a[1])
  const activeStats=activeStatistics(data)
  const activeClients=activeStats.clients
  const visibleTasks = data.tasks.filter(t=>(taskFilter==='all'||(taskFilter==='open'?!t.done:t.done))&&(taskPriorityFilter==='all'||t.priority===taskPriorityFilter))
  const outstanding = data.tasks.filter(t => !t.done).length
  const urgentTasks = data.tasks.filter(t => !t.done && t.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))
  const dueFollowups = [...projects.filter(p => isActiveProject(p)&&p.nextFollowUp).map(p => ({ id:p.id,kind:'project' as const,name:p.name,date:p.nextFollowUp,detail:p.nextAction || 'Project follow-up' })), ...data.leads.filter(l => l.followUp && l.stage !== 'Closed Won' && l.stage !== 'Lost').map(l => ({id:l.id,kind:'lead' as const,name:l.company,date:l.followUp,detail:'Sales follow-up'}))] .sort((a,b)=>a.date.localeCompare(b.date))
  const financeTransactions = data.transactions.filter(t=>financePeriod==='all'||!t.date||t.date>=new Date(Date.now()-Number(financePeriod)*86400000).toLocaleDateString('en-CA'))
  const financeCollected = sumBase(financeTransactions.filter(t=>t.kind==='Income'&&t.status==='Paid'))
  const financePending = sumBase(financeTransactions.filter(t=>t.kind==='Income'&&t.status==='Pending'))
  const financeSpent = sumBase(financeTransactions.filter(t=>t.kind==='Expense'&&t.status==='Paid'))
  const financeRows = financeTransactions.filter(t=>financeFilter==='all'||(financeFilter==='income'&&t.kind==='Income'&&t.status==='Paid')||(financeFilter==='pending'&&t.status==='Pending')||(financeFilter==='expense'&&t.kind==='Expense'))
  const topClientRevenue = data.clients.map(client=>({id:client.id,name:client.name,value:sumBase(financeTransactions.filter(t=>t.kind==='Income'&&t.status==='Paid'&&t.clientId===client.id))})).filter(item=>item.value>0).sort((a,b)=>b.value-a.value).slice(0,5)
  const activeRetainers = projects.filter(p=>isActiveProject(p)&&(p.dealType==='Retainer'||p.status==='Active Retainer'))
  const notificationItems: {kind:'task'|'lead'|'project'|'operations';id:string;title:string;date:string;key:string}[] = [...data.tasks.filter(t=>!t.done&&t.dueDate&&t.dueDate<=new Date(Date.now()+3*86400000).toLocaleDateString('en-CA')).map(t=>({kind:'task' as const,id:t.id,title:t.title,date:t.dueDate,key:`task:${t.id}:${t.dueDate}`})),...dueFollowups.filter(f=>!data.tasks.some(t=>t.id===`auto:${f.kind}:${f.id}:${f.date}`)&&f.date<=new Date(Date.now()+3*86400000).toLocaleDateString('en-CA')).map(f=>({kind:f.kind,id:f.id,title:`Follow up: ${f.name}`,date:f.date,key:`${f.kind}:${f.id}:${f.date}`}))].slice(0,20)
  const opsFollowups = (data.operations||[]).filter(r=>r.category!=='invoices'&&r.dueDate && r.dueDate<=new Date(Date.now()+3*86400000).toLocaleDateString('en-CA') && !['Paid','Finished','Sent','Renewed','Ended','Closed','Cancelled','Delivered','Completed','Archived'].includes(r.status)).map(r=>({kind:'operations' as const,id:r.id,title:`${r.category}: ${r.title}`,date:r.dueDate,key:`ops:${r.id}:${r.dueDate}`}))
  notificationItems.push(...opsFollowups)
  const readNotifications = data.preferences.readNotificationKeys || []
  const unreadCount = notificationItems.filter(item => !readNotifications.includes(item.key)).length
  const markNotificationRead = (key: string) => setData(prev => ({...prev, preferences: {...prev.preferences, readNotificationKeys: [...new Set([...(prev.preferences.readNotificationKeys || []).filter(saved => notificationItems.some(item => item.key === saved)),key])]}}))
  const markAllNotificationsRead = () => setData(prev => ({...prev, preferences: {...prev.preferences, readNotificationKeys: [...new Set([...(prev.preferences.readNotificationKeys || []).filter(saved => notificationItems.some(item => item.key === saved)),...notificationItems.map(item => item.key)])]}}))
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return [...data.clients.filter(c => `${c.name} ${c.contact} ${c.services.join(' ')}`.toLowerCase().includes(q)).map(c => ({ kind:'client' as RecordKind,id:c.id,name:c.name,context:`Client · ${c.status}` })), ...data.leads.filter(l => `${l.company} ${l.contact}`.toLowerCase().includes(q)).map(l => ({kind:'lead' as RecordKind,id:l.id,name:l.company,context:`Lead · ${l.stage}` })), ...data.tasks.filter(t => t.title.toLowerCase().includes(q)).map(t => ({kind:'task' as const,id:t.id,name:t.title,context:`Task · ${t.done?'Done':'Open'}` })),...projects.filter(p=>`${p.name} ${p.services.join(' ')}`.toLowerCase().includes(q)).map(p=>({kind:'project' as const,id:p.id,name:p.name,context:`Project · ${p.status}`})),...(data.operations||[]).filter(r=>`${r.title} ${r.details} ${r.category} ${r.status}`.toLowerCase().includes(q)).map(r=>({kind:'operation' as const,id:r.id,name:r.title,context:`${r.category} · ${r.status}`}))].slice(0,12)
  }, [query, data])

  const transactionsByMonth = useMemo(() => {
    const monthOffsets = Array.from({ length:6 }, (_,i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5-i)); return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month:d.toLocaleDateString('en-GB',{ month:'short' }), income:0, expense:0 } })
    for (const t of data.transactions) { if (t.status !== 'Paid') continue; const item = monthOffsets.find(m => m.key === t.date.slice(0,7)); if (item) item[t.kind === 'Income' ? 'income' : 'expense'] += converted(t.amount,t.currency||'DKK','DKK') }
    return monthOffsets
  }, [data.transactions])
  const chartHasData = transactionsByMonth.some(v => v.income > 0 || v.expense > 0)
  const editingProject = projectDialog ? (projectDialog.id?getProject(projectDialog.id):{...defaultProject(projectDialog.clientId||''),status:projectDialog.stage||'Onboarding'}) : null
  const editingItem = dialog ? (dialog.id ? (dialog.kind === 'client' ? data.clients.find(c=>c.id === dialog.id) : dialog.kind === 'lead' ? data.leads.find(l=>l.id===dialog.id) : dialog.kind === 'task' ? data.tasks.find(t=>t.id===dialog.id) : data.transactions.find(t=>t.id===dialog.id)) : dialog.kind === 'client' ? {...defaultClient(), status: dialog.stage || 'Onboarding'} : dialog.kind === 'lead' ? defaultLead() : dialog.kind === 'task' ? {...defaultTask(),clientId:dialog.clientId||'',projectId:dialog.projectId||''} : {...defaultTransaction(),clientId:dialog.clientId||'',projectId:dialog.projectId||'',currency:displayCurrency}) : null

  const importLeadsCsv = async (event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]
    event.target.value=''
    if(!file)return
    try{
      if(file.size>4_000_000)throw new Error('Limit: 4 MB CSV files.')
      const rows=parseCsv(await file.text())
      if(rows.length<2)throw new Error('The CSV has no data rows.')
      const columns=rows[0].map(v=>v.trim().toLowerCase().replace(/[ _-]/g,''))
      const get=(row:string[],...names:string[])=>{const index=columns.findIndex(name=>names.includes(name));return index<0?'':(row[index]||'').trim()}
      if(!columns.some(c=>['company','business','name','client'].includes(c)))throw new Error('Add a Company, Business, Name or Client column to your CSV.')
      const existing=new Set(data.leads.map(l=>(l.email||l.company).trim().toLowerCase()))
      const imported:Lead[]=[]
      for(const row of rows.slice(1,2001)){
        const company=get(row,'company','business','name','client')
        if(!company)continue
        const email=get(row,'email','emailaddress')
        const key=(email||company).toLowerCase()
        if(existing.has(key))continue
        existing.add(key)
        const rawValue=get(row,'value','dealvalue','amount').replace(/[^0-9.,-]/g,'').replace(',','.')
        imported.push({...defaultLead(),company,contact:get(row,'contact','contactperson'),email,phone:get(row,'phone','mobile'),source:get(row,'source','leadsource')||'CSV import',notes:get(row,'notes','description'),value:rawValue?Number(rawValue)||null:null})
      }
      if(!imported.length)throw new Error('No new lead rows found (duplicates are skipped).')
      if(!confirm(`Import ${imported.length} new leads? This adds records to your CRM; it will not replace your existing leads.`))return
      setData(prev=>({...prev,leads:[...imported,...prev.leads],activityLog:[{id:uid(),date:new Date().toISOString(),label:`Imported ${imported.length} CSV leads`},...(prev.activityLog||[])].slice(0,250)}))
      setToast(`${imported.length} leads imported`)
    }catch(error){setToast(error instanceof Error?error.message:'CSV import failed')}
  }
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `paid-hustle-backup-${today()}.json`; link.click(); window.setTimeout(()=>URL.revokeObjectURL(link.href), 1000)
    setToast('Backup downloaded')
  }
  const exportCsv = (kind:'clients'|'projects'|'leads'|'tasks'|'transactions')=>{
    let rows:(string|number|boolean|null|undefined)[][]=[]
    if(kind==='clients') rows=[['Name','Contact','Email','Phone','Status','Currency','Notes'],...data.clients.map(x=>[x.name,x.contact,x.email,x.phone,x.status,x.currency,x.notes])]
    if(kind==='projects') rows=[['Project','Client','Status','Priority','Deadline','Next action'],...(data.projects||[]).map(x=>[x.name,getClient(x.clientId)?.name||'',x.status,x.priority,x.deadline,x.nextAction])]
    if(kind==='leads') rows=[['Company','Contact','Email','Phone','Stage','Source','Follow-up','Lost reason'],...data.leads.map(x=>[x.company,x.contact,x.email,x.phone,x.stage,x.source,x.followUp,x.lostReason])]
    if(kind==='tasks') rows=[['Task','Client','Project','Priority','Due','Completed'],...data.tasks.map(x=>[x.title,getClient(x.clientId)?.name||'',getProject(x.projectId||'')?.name||'',x.priority,x.dueDate,x.done])]
    if(kind==='transactions') rows=[['Description','Client','Type','Amount','Currency','Status','Date'],...data.transactions.map(x=>[x.description,getClient(x.clientId)?.name||'',x.kind,x.amount,x.currency,x.status,x.date])]
    const blob=new Blob([encodeCsv(rows)],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a')
    anchor.href=url;anchor.download=`paid-hustle-${kind}-${today()}.csv`;anchor.click()
    window.setTimeout(()=>URL.revokeObjectURL(url),1500)
    setToast(`${kind} CSV exported`)
  }
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('Backup is too large (4 MB maximum)')
      const parsed: unknown = JSON.parse(await file.text())
      if (!validateWorkspace(parsed)) throw new Error('This is not a valid PAID HUSTLE backup')
      const restored = upgradeWorkspace(parsed)
      const audit = auditWorkspaceBackup(restored)
      if (audit.errors.length) throw new Error('Import blocked to protect your data: '+audit.errors.slice(0,3).join('; '))
      const present = audit.counts
      const current = auditWorkspaceBackup(data).counts
      const summary = `BACKUP CONTENTS\n${present.clients} clients, ${present.projects} projects, ${present.leads} leads, ${present.tasks} tasks, ${present.transactions} transactions, ${present.operations} operations records.\n\nCURRENT WORKSPACE\n${current.clients} clients, ${current.projects} projects, ${current.leads} leads, ${current.tasks} tasks, ${current.transactions} transactions, ${current.operations} operations records.\n\nThis action REPLACES the entire current workspace. Existing records not in the backup will be removed. Export your current data first. ${audit.warnings.length?'\n\nNotes: '+audit.warnings.join('; '):''}`
      if (window.confirm(summary) && window.confirm('Final confirmation: Replace current workspace with this verified backup?')) {
        setData(restored)
        setToast('Backup accepted — verify that cloud sync reaches Saved before refreshing')
      }
    } catch(e) { setToast(e instanceof Error ? e.message : 'Could not import backup') }
  }
  const clearWorkspace = () => { if (window.confirm('Delete ALL workspace records? This cannot be undone. Export a backup first.') && window.confirm('Are you absolutely sure you want an empty workspace?')) { setData(emptyWorkspace()); setToast('Workspace cleared') } }

  if (invalidUrl) return <div className="loading-page"><div className="inline-error">Supabase URL configuration is invalid. Check VITE_SUPABASE_URL in Netlify and redeploy. Your data has not been deleted.</div></div>
  if (authLoading) return <div className="loading-page"><div className="loading-orb"><img src={strategyScaleIcon} alt=""/></div><p>Opening your workspace…</p></div>
  if (cloudEnabled && !session) return <Login />
  if (!loaded) return <div className="loading-page"><div className="loading-orb"><img src={strategyScaleIcon} alt=""/></div><p>Loading private data…</p>{sync === 'error' && <div className="inline-error"><AlertCircle size={16}/>{syncError || 'Your workspace could not be loaded safely.'}</div>}{sync === 'error' && <button className="btn btn-subtle" onClick={retrySync}><RefreshCcw size={16}/>Retry loading</button>}</div>

  return <div className="app-shell">
    {mobileOpen && <div className="mobile-shade" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand" aria-label="Strategy Scale"><div className="brand-mark"><img src={strategyScaleIcon} alt="Strategy Scale icon" /></div><div className="brand-title"><strong>Strategy Scale</strong><span>AGENCY WORKSPACE</span></div><IconButton title="Close navigation" onClick={()=>setMobileOpen(false)} className="sidebar-close"><X size={18}/></IconButton></div>
      <div className="sidebar-caption">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">{navOrder.filter(name => ['overview','focus','projects','pipeline','tasks','finance'].includes(name) && (name === 'overview' || !hiddenPages.includes(name))).map(name => { const Icon = icons[name]; return <button key={name} className={`nav-link ${page===name ? 'nav-active':''}`} aria-current={page===name?'page':undefined} onClick={()=>navigate(name)}><Icon size={18}/><span>{pageNames[name]}</span>{name==='tasks' && outstanding>0 && <em>{outstanding}</em>}</button> })}</nav>
      <div className="nav-extras"><button className={`nav-link nav-more ${['operations','insights'].includes(page) ? 'nav-more-current' : ''}`} onClick={()=>setMoreToolsOpen(v=>!v)} aria-expanded={moreToolsOpen} aria-controls="advanced-nav"><Boxes size={18}/><span>More tools</span><ChevronDown className={moreToolsOpen?'rotate-chevron':''} size={16}/></button>
      {moreToolsOpen && <nav id="advanced-nav" className="sidebar-nav sidebar-nav-advanced" aria-label="More tools">{navOrder.filter(name => ['operations','insights'].includes(name) && !hiddenPages.includes(name)).map(name => {const Icon=icons[name];return <button key={name} className={`nav-link ${page===name?'nav-active':''}`} aria-current={page===name?'page':undefined} onClick={()=>navigate(name)}><Icon size={18}/><span>{pageNames[name]}</span></button>})}</nav>}</div>
      <div className="sidebar-caption sidebar-caption-second">SYSTEM</div><nav className="sidebar-nav"><button className={`nav-link ${page==='settings' ? 'nav-active':''}`} onClick={()=>navigate('settings')}><Settings2 size={18}/><span>Settings</span></button></nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Sparkles size={18}/><b>Keep the momentum.</b><span>{dailyMessage(calendarDay)}</span></div>
        <div className="sync-status"><span className={`sync-dot ${sync === 'error'||sync==='conflict' ? 'sync-red' : sync==='saving' ? 'sync-yellow' : ''}`}/>{sync==='local' ? 'Local preview · this browser' : sync==='saving' ? 'Syncing changes…' : sync==='conflict'?'Review conflicting edits':sync==='error' ? 'Retrying cloud sync' : 'Cloud data saved'}</div>
        <div className="sidebar-profile"><div className="profile-avatar">A</div><div><b>Workspace owner</b><small>{session?.user.email || 'Local preview'}</small></div>{cloudEnabled && <IconButton title="Sign out" onClick={()=>db?.auth.signOut()}><LogOut size={16}/></IconButton>}</div>
      </div>
    </aside>

    <div className="main-column"><header className="topbar"><div className="topbar-left"><IconButton title="Open menu" className="hamburger" onClick={()=>setMobileOpen(true)}><Menu size={21}/></IconButton><span className="breadcrumb">Workspace</span><ChevronRight size={14}/><strong>{hub?.type==='project'?getProject(hub.id)?.name:hub?.type==='client'?getClient(hub.id)?.name:pageNames[page]}</strong></div>
      <div className="topbar-right"><div className="header-search"><Search size={16}/><input ref={searchInput} placeholder="Search everything…" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value); setSearchOpen(true)}}/><kbd>⌘ K</kbd></div><IconButton title="Notifications" onClick={()=>setNotificationsOpen(v=>!v)}><Bell size={18}/>{unreadCount>0&&<span className="notification-dot"/>}</IconButton><div className="quick-add-wrap"><button className="btn btn-primary add-header" aria-expanded={quickAddOpen} aria-haspopup="menu" onClick={()=>setQuickAddOpen(v=>!v)}><Plus size={17}/>New<ChevronDown size={15}/></button>{quickAddOpen&&<div className="quick-add-menu" role="menu" aria-label="Create new"><button role="menuitem" onClick={()=>{add('lead');setQuickAddOpen(false)}}><Target size={16}/>Lead</button><button role="menuitem" onClick={()=>{add('client');setQuickAddOpen(false)}}><Users size={16}/>Client</button><button role="menuitem" onClick={()=>{addProject('');setQuickAddOpen(false)}}><FolderKanban size={16}/>Project</button><button role="menuitem" onClick={()=>{add('task');setQuickAddOpen(false)}}><ListTodo size={16}/>Task</button><button role="menuitem" onClick={()=>{add('transaction');setQuickAddOpen(false)}}><Wallet size={16}/>Transaction</button></div>}</div></div>
      {searchOpen && <div className="search-popover"><div className="search-pop-header">{query.trim() ? `Search results for “${query}”` : 'Start typing to search clients, leads and tasks'}<IconButton title="Close search" onClick={()=>setSearchOpen(false)}><X size={15}/></IconButton></div>{!query.trim()&&<div style={{padding:12,display:'flex',flexDirection:'column',gap:6}}><span className="setting-hint">QUICK ACTIONS</span>{([['New client',()=>add('client')],['New lead',()=>add('lead')],['New task',()=>add('task')],['New project',()=>addProject('')],['Add transaction',()=>add('transaction')],['Agency Intelligence',()=>navigate('insights')],['Automation settings',()=>navigate('settings')]] as const).map(([title,action])=><button key={title} className="search-result" onClick={()=>{action();setSearchOpen(false)}}><Plus size={14}/><span><b>{title}</b></span></button>)}</div>}{query.trim() && (searchResults.length ? searchResults.map(r=><button key={`${r.kind}-${r.id}`} className="search-result" onClick={()=>{if(r.kind==='project')openProject(r.id);else if(r.kind==='client')openClient(r.id);else if(r.kind==='operation'){setOperationJump({id:r.id,nonce:uid()});navigate('operations')}else edit(r.kind,r.id);setSearchOpen(false);setQuery('')}}><Search size={15}/><span><b>{r.name}</b><small>{r.context}</small></span><ArrowUpRight size={16}/></button>) : <div className="search-noresult">No matching records</div>)}</div>}
      {notificationsOpen&&<div className="notification-popover"><div className="search-pop-header"><b>Notifications · {unreadCount} unread</b><IconButton title="Close notifications" onClick={()=>setNotificationsOpen(false)}><X size={15}/></IconButton></div>{notificationItems.length?notificationItems.map(n=><button key={n.key} className={`search-result ${readNotifications.includes(n.key)?'notification-read':'notification-unread'}`} onClick={()=>{markNotificationRead(n.key);if(n.kind==='project')openProject(n.id);else if(n.kind==='operations')navigate('operations');else edit(n.kind,n.id);setNotificationsOpen(false)}}><CalendarClock size={16}/><span><b>{n.title}</b><small>{formatDate(n.date)} {isOverdue(n.date)?'· Overdue':''}</small></span>{!readNotifications.includes(n.key)&&<span className="unread-pip"/>}<ArrowRight size={15}/></button>):<div className="search-noresult">Nothing urgent. You're on track.</div>}<div className="notification-foot"><span>In-app alerts; optional owner email digest with server setup.</span>{unreadCount>0&&<button className="btn btn-subtle btn-sm" onClick={markAllNotificationsRead}><CheckCheck size={13}/>Mark all read</button>}</div></div>}
    </header>

    <main className={`content page-${page}`}><SyncNotice status={sync} message={syncError} retry={retrySync} conflicts={conflicts} resolve={resolveConflicts}/><input ref={csvInput} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={importLeadsCsv}/>
      {!hub && page === 'focus' && <FocusPage data={data} onOpenTask={id=>edit('task',id)} onCompleteTask={toggleTask} onOpenLead={id=>edit('lead',id)} onOpenProject={openProject} onAddTask={()=>add('task')} onOpenFinance={()=>navigate('finance')}/>}
      {!hub && page === 'insights' && <InsightsPage data={data} setData={setData} onClient={openClient} onLead={id=>edit('lead',id)} onProject={openProject}/>}
      {!hub && page === 'operations' && <OperationsPage syncReady={sync==='saved'} data={data} setData={setData} db={db} session={session} jump={operationJump} onNewTask={(clientId, projectId)=>add('task',clientId,projectId)}/>}
      {!hub && page === 'overview' && <>
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR WORKSPACE</div><h1>A clear view of <span>your business.</span></h1><p>The work that matters, without the noise.</p></div><div className="date-pill"><CalendarDays size={16}/>{new Date().toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</div></div>
        {!cloudEnabled && <div className="demo-banner"><AlertCircle size={18}/><div><b>Browser-only preview</b><span>Changes are saved only in this browser. To make this a private synced app, connect Supabase using the setup guide.</span></div><button onClick={()=>navigate('settings')}>Setup details <ArrowRight size={14}/></button></div>}
        <div className="metrics-grid" style={{display:hiddenWidgets.includes('metrics')?'none':undefined}}>
          <Metric icon={Users} label="Active clients" value={String(activeClients).padStart(2,'0')} detail={`${data.clients.length} total in workspace`} tone="purple" onClick={()=>navigate('projects')}/>
          <Metric icon={TrendingUp} label="Gross collections" value={shortMoney(paidIncome)} detail="Paid income recorded" tone="green" onClick={()=>navigate('finance')}/>
          <Metric icon={Clock3} label="Awaiting payment" value={shortMoney(pendingIncome)} detail="Pending income entries" tone="orange" onClick={()=>navigate('finance')}/>
          <Metric icon={Target} label="Pipeline value" value={shortMoney(pipelineAmount)} detail={`${data.leads.filter(l=>l.stage!=='Closed Won' && l.stage!=='Lost').length} open opportunities`} tone="blue" onClick={()=>navigate('pipeline')}/>
        </div>
        <div className="dashboard-grid" style={{display:hiddenWidgets.includes('dashboard')?'none':undefined}}><Panel className="revenue-panel"><div className="panel-header"><div><div className="eyebrow">PERFORMANCE</div><h2>Collections overview</h2><p>Money received vs. expenses paid</p></div><Badge>Last 6 months</Badge></div>
          <div className="revenue-summary"><div><span>Net collected</span><strong>{money(paidIncome-expenses)}</strong></div><span className="chart-key"><i className="key-purple"/>Income<i className="key-dim"/>Expenses</span></div>
          {chartHasData ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={transactionsByMonth} barGap={5} barCategoryGap="32%"><CartesianGrid vertical={false} stroke="#24252a" strokeDasharray="3 6"/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fill:'#777b89',fontSize:12}} dy={11}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#777b89',fontSize:11}} tickFormatter={v => shortMoney(Number(v))}/><Tooltip cursor={{fill:'#ffffff08'}} contentStyle={{background:'#1a1b20',border:'1px solid #303039',borderRadius:12,color:'#fff'}} formatter={(v) => money(Number(v)||0)}/><Bar dataKey="income" fill="#14b8a6" radius={[5,5,0,0]}/><Bar dataKey="expense" fill="#454450" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div> : <div className="chart-empty"><BarChart3 size={28}/><b>Your numbers will appear here</b><span>Record paid income or expenses to populate this chart.</span><button className="btn btn-subtle btn-sm" onClick={()=>add('transaction')}><Plus size={14}/>Add a transaction</button></div>}
        </Panel>
        <Panel className="todo-panel"><div className="panel-header"><div><div className="eyebrow">STAY ON TRACK</div><h2>Priority to-dos</h2><p>{outstanding} open {outstanding===1?'task':'tasks'}</p></div><button className="text-action" onClick={()=>navigate('tasks')}>See all <ArrowUpRight size={15}/></button></div>
          <div className="todo-list">{data.tasks.filter(t=>!t.done).sort((a,b)=>(a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0,5).map(t=><div className="todo-row" key={t.id}><button className="task-checkbox" title="Complete task" onClick={()=>toggleTask(t.id)}><Check size={13}/></button><button className="todo-title" onClick={()=>edit('task',t.id)}><b>{t.title}</b><span>{getClient(t.clientId)?.name || 'General task'}{getProject(t.projectId||'')?` · ${getProject(t.projectId||'')!.name}`:''}{t.subtasks?.length?` · ${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length} subtasks`:''}</span></button><span className={`small-date ${isOverdue(t.dueDate)?'date-overdue':''}`}>{t.dueDate ? formatDateShort(t.dueDate) : 'No date'}</span></div>)}{!data.tasks.some(t=>!t.done) && <Empty icon={CheckCheck} title="All caught up" description="No open tasks right now." action="Add a task" onAction={()=>add('task')}/>}</div>
          <button className="panel-footer-link" onClick={()=>add('task')}><Plus size={16}/> Add task</button>
        </Panel></div>
        <ClientHealth data={data} onOpenClient={openClient}/>
        <div className="bottom-grid" style={{display:hiddenWidgets.includes('bottom')?'none':undefined}}><Panel><div className="panel-header"><div><div className="eyebrow">YOUR WORK</div><h2>Active projects</h2></div><button className="text-action" onClick={()=>navigate('projects')}>View board <ArrowUpRight size={15}/></button></div><div className="project-mini-list">{projects.filter(p=>p.status!=='Completed').slice(0,5).map(p=><button key={p.id} className="project-mini" onClick={()=>openProject(p.id)}><div className="client-initial"><FolderKanban size={15}/></div><div className="mini-main"><strong>{p.name}</strong><span>{getClient(p.clientId)?.name||'Client'} · {p.services.join(' · ')||'Project command center'}</span></div><Badge tone={statusColor[p.status]} dot>{p.status}</Badge><ChevronRight size={15}/></button>)}{!projects.length&&<Empty icon={FolderKanban} title="No projects yet" description="Start a project to see it here." action="Create project" onAction={()=>addProject()}/>}</div></Panel>
          <Panel><div className="panel-header"><div><div className="eyebrow">COMING UP</div><h2>Client follow-ups</h2></div><button className="text-action" onClick={()=>navigate('projects')}>All clients <ArrowUpRight size={15}/></button></div><div className="followup-list">{dueFollowups.slice(0,5).map(f=><button className="followup-row" key={f.id} onClick={()=>{if(f.kind==='project')openProject(f.id);else edit('lead',f.id)}}><div className={`followup-date ${isOverdue(f.date)?'overdue':''}`}><strong>{new Date(`${f.date}T12:00:00`).getDate()}</strong><span>{new Date(`${f.date}T12:00:00`).toLocaleDateString('en-GB',{month:'short'})}</span></div><div><strong>{f.name}</strong><span>{f.detail}</span></div><Badge tone={isOverdue(f.date)?'rose':'gray'}>{isOverdue(f.date)?'Overdue':'Upcoming'}</Badge></button>)}{dueFollowups.length===0 && <Empty icon={CalendarClock} title="Nothing scheduled" description="Add follow-up dates to clients or leads."/>}</div></Panel></div>
      </>}

      {!hub && page === 'projects' && <>
        <PageHeading kicker="CLIENT DELIVERY" title="Clients & projects" description="One client. Multiple projects. Every deliverable in its place." action="New project" onAction={()=>addProject()}/>
        <div className="page-stats"><span><b>{activeStats.clients}</b> Active Clients</span><span><b>{activeStats.projects}</b> Active Projects</span><span><b>{activeStats.retainers}</b> Active Retainers</span></div>
        <div className="view-toolbar"><div className="segmented"><button className={projectFilter==='board'?'selected':''} onClick={()=>setProjectFilter('board')}><FolderKanban size={15}/>Project board</button><button className={projectFilter==='list'?'selected':''} onClick={()=>setProjectFilter('list')}><ListTodo size={15}/>Project list</button><button className={projectFilter==='clients'?'selected':''} onClick={()=>setProjectFilter('clients')}><Users size={15}/>Clients</button></div><span className="muted-caption">Click a project to open its command center</span></div>
        {projectFilter==='board' && <div className="kanban-scroll"><div className="kanban-board">{projectPipeline.map(stage=><div key={stage} className="kanban-col" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('application/paid-hustle-project');if(id)updateProject(id,{status:stage},`Moved to ${stage}`)}}><div className="kanban-head"><span className={`stage-dot stage-${statusColor[stage]}`}/><b>{stage}</b><em>{projects.filter(p=>p.status===stage).length}</em><button aria-label={`Add project to ${stage}`} onClick={()=>addProject('',stage)}><Plus size={16}/></button></div><div className="kanban-content">{projects.filter(p=>p.status===stage).map(p=><ProjectBoardCard key={p.id} project={p} clientName={getClient(p.clientId)?.name||'Unassigned client'} transactions={data.transactions} onOpen={()=>openProject(p.id)}/>)}<button className="kanban-add" onClick={()=>addProject('',stage)}><Plus size={15}/> Add project</button></div></div>)}</div></div>}
        {projectFilter==='list' && <div className="table-shell"><table className="data-table"><thead><tr><th>PROJECT</th><th>CLIENT</th><th>SERVICES</th><th>STATUS</th><th>DEADLINE</th><th>DEAL VALUE</th><th/></tr></thead><tbody>{projects.map(p=><tr key={p.id} onClick={()=>openProject(p.id)}><td><span className="table-name"><span className="client-initial"><FolderKanban size={14}/></span>{p.name}</span></td><td>{getClient(p.clientId)?.name||'—'}</td><td>{p.services.join(', ')||'—'}</td><td><Badge tone={statusColor[p.status]} dot>{p.status}</Badge></td><td className={isOverdue(p.deadline)?'date-overdue':''}>{formatDate(p.deadline)}</td><td>{p.dealValue==null?'—':money(p.dealValue,p.currency)}</td><td><ChevronRight size={15}/></td></tr>)}</tbody></table>{!projects.length&&<Empty icon={FolderKanban} title="Your project board is ready" description="Create a client, then start a project to unlock its command center." action="New project" onAction={()=>addProject()}/>}</div>}
        {projectFilter==='clients'&&<div className="client-directory-grid">{data.clients.filter(c=>!c.archivedAt).map(client=><button key={client.id} className="client-directory-card" onClick={()=>openClient(client.id)}><div className="client-initial">{client.name.slice(0,2).toUpperCase()}</div><div><strong>{client.name}</strong><span>{projects.filter(p=>p.clientId===client.id).length} projects · {client.contact||'No contact person'}</span></div><ChevronRight size={18}/></button>)}{!data.clients.length&&<Empty icon={Users} title="No clients yet" description="Add a client to get started." action="Add client" onAction={()=>add('client')}/>}<button className="client-directory-add" onClick={()=>add('client')}><Plus size={18}/>Add client</button></div>}
      </>}

      {!hub && page === 'pipeline' && <>
        <PageHeading kicker="GROW THE BUSINESS" title="Sales pipeline" description="Track conversations, opportunities, and your next big win." action="Add lead" onAction={()=>add('lead')}/>
        <div className="pipeline-import"><button className="btn btn-subtle" onClick={()=>csvInput.current?.click()}><Upload size={16}/>Import Leads</button><span className="setting-hint">CSV · Existing leads are kept; duplicates are skipped.</span></div>
        <div className="page-stats"><span><b>{data.leads.filter(l=>l.stage!=='Closed Won'&&l.stage!=='Lost').length}</b> Open leads</span><span><b>{shortMoney(pipelineAmount)}</b> Pipeline value</span><span><b>{data.leads.filter(l=>l.stage==='Closed Won').length}</b> Won deals</span><span><b>{data.leads.filter(l=>l.stage==='Meeting Booked').length}</b> Meetings booked</span></div>
        <div className="view-toolbar"><span className="muted-caption"><GripVertical size={15}/>Drag deals across stages. Click any card to edit.</span><span className="muted-caption">Closed-deal win rate: {salesWinRate===null?'Not enough data':`${salesWinRate}%`}</span></div>
        <Panel><div className="panel-header"><div><div className="eyebrow">LEARN FROM LOST DEALS</div><h2>Why prospects said no</h2><p>Based on reasons you recorded when marking CRM deals as Lost. Unknown reasons are kept separate.</p></div><Badge>{closedDeals.length} closed deals</Badge></div>{lostDealReasons.length?<div className="ops-record-list">{lostDealReasons.map(([reason,count])=><div key={reason} className="setting-row"><span>{reason}</span><strong>{count} {count===1?'lead':'leads'}</strong></div>)}</div>:<p className="muted-caption">No lost deals recorded yet. Add a reason to a Lost CRM lead to see patterns.</p>}</Panel>
        <div className="kanban-scroll"><div className="kanban-board pipeline-board">{salesPipeline.map(stage=><div key={stage} className="kanban-col" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('application/paid-hustlee-lead');if(id)updateLeadStage(id,stage)}}><div className="kanban-head"><span className={`stage-dot stage-${statusColor[stage]}`}/><b>{stage}</b><em>{data.leads.filter(l=>l.stage===stage).length}</em></div><div className="kanban-content">{data.leads.filter(l=>l.stage===stage).map(l=><div key={l.id} className="kanban-card deal-card" draggable onDragStart={e=>e.dataTransfer.setData('application/paid-hustlee-lead',l.id)} onClick={()=>edit('lead',l.id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')edit('lead',l.id)}}><div className="deal-card-top"><div className="lead-initial">{l.company.slice(0,1).toUpperCase()}</div><MoreHorizontal size={17}/></div><strong>{l.company}</strong><span className="deal-contact">{l.contact || l.source || 'No contact yet'}</span><div className="deal-bottom"><b>{l.value == null ? 'Value not set' : money(l.value,l.currency||'DKK')}</b>{l.followUp&&<span className={isOverdue(l.followUp)?'date-overdue':''}>{formatDateShort(l.followUp)}</span>}</div></div>)}<button className="kanban-add" onClick={()=>add('lead')}><Plus size={15}/> Add opportunity</button></div></div>)}</div></div>
      </>}

      {!hub && page === 'tasks' && <>
        <PageHeading kicker="EXECUTION" title="Your tasks" description="Stay focused on the next action, not the noise." action="New task" onAction={()=>add('task')}/>
        <div className="page-stats"><span><b>{outstanding}</b> Remaining</span><span><b>{data.tasks.filter(t=>t.done).length}</b> Completed</span><span><b>{data.tasks.filter(t=>!t.done&&isOverdue(t.dueDate)).length}</b> Overdue</span><span><b>{data.tasks.filter(t=>!t.done&&t.priority==='High').length}</b> High priority</span></div>
        <div className="view-toolbar"><div className="segmented"><button className={taskFilter==='open'?'selected':''} onClick={()=>setTaskFilter('open')}>Open</button><button className={taskFilter==='all'?'selected':''} onClick={()=>setTaskFilter('all')}>All</button><button className={taskFilter==='completed'?'selected':''} onClick={()=>setTaskFilter('completed')}>Completed</button></div><select aria-label="Filter task priority" value={taskPriorityFilter} onChange={e=>setTaskPriorityFilter(e.target.value as typeof taskPriorityFilter)}><option value="all">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></div>
        <div className="view-toolbar" style={{flexWrap:'wrap',gap:10}}><label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={visibleTasks.length>0&&visibleTasks.every(t=>selectedTaskIds.includes(t.id))} onChange={e=>setSelectedTaskIds(e.target.checked?[...new Set([...selectedTaskIds,...visibleTasks.map(t=>t.id)])]:selectedTaskIds.filter(id=>!visibleTasks.some(t=>t.id===id)))}/>Select visible ({visibleTasks.length})</label><span>{selectedTaskIds.length} selected</span><button className="btn btn-subtle btn-sm" disabled={!selectedTaskIds.length} onClick={()=>bulkTasks('complete')}>Complete</button><button className="btn btn-subtle btn-sm" disabled={!selectedTaskIds.length} onClick={()=>bulkTasks('reopen')}>Reopen</button><button className="btn btn-subtle btn-sm" disabled={!selectedTaskIds.length} onClick={()=>bulkTasks('high')}>Set high priority</button><button className="btn btn-subtle btn-sm" disabled={!selectedTaskIds.length} onClick={()=>bulkTasks('remove')}>Delete selected</button></div>
        <Panel className="task-table"><div className="tasks-section-title"><ListTodo size={18}/>Tasks <span>{visibleTasks.length}</span></div>{visibleTasks.slice().sort((a,b)=>Number(a.done)-Number(b.done)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).map(t=><div className={`task-list-row ${t.done?'task-completed':''}`} key={t.id}><input type="checkbox" aria-label={`Select task ${t.title}`} checked={selectedTaskIds.includes(t.id)} onChange={e=>setSelectedTaskIds(prev=>e.target.checked?[...new Set([...prev,t.id])]:prev.filter(id=>id!==t.id))}/><button className={`big-check ${t.done?'big-check-done':''}`} title={t.done?'Mark as open':'Complete task'} onClick={()=>toggleTask(t.id)}>{t.done&&<Check size={15}/>}</button><button className="task-info" onClick={()=>edit('task',t.id)}><strong>{t.title}</strong><span>{getClient(t.clientId)?.name || 'General task'}{getProject(t.projectId||'')?` · ${getProject(t.projectId||'')!.name}`:''}{t.subtasks?.length?` · ${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length} subtasks`:''}</span></button><Badge tone={statusColor[t.priority]}>{t.priority}</Badge><span className={`task-due ${isOverdue(t.dueDate)&&!t.done?'date-overdue':''}`}><CalendarDays size={14}/>{formatDate(t.dueDate)}</span><IconButton title="Edit task" onClick={()=>edit('task',t.id)}><MoreHorizontal size={18}/></IconButton></div>)}{!visibleTasks.length && <Empty icon={CheckCircle2} title="Nothing here" description="All clear. Add a task whenever you're ready." action="Add task" onAction={()=>add('task')}/>}<button className="task-add-bottom" onClick={()=>add('task')}><Plus size={16}/>Add a task</button></Panel>
      </>}

      {!hub && page === 'finance' && <>
        <PageHeading kicker="BUSINESS NUMBERS" title="Finances" description="Know what you have earned, what’s due, and what you’ve spent." action="Add transaction" onAction={()=>add('transaction')}/>
        <div className="finance-controls"><div className="finance-controls-side"><span>Reporting period</span><select aria-label="Finance reporting period" value={financePeriod} onChange={e=>setFinancePeriod(e.target.value as typeof financePeriod)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></div><div className="finance-controls-side"><span>Display currency</span><div className="currency-switch">{currencies.map(cur=><button className={displayCurrency===cur?'active':''} key={cur} onClick={()=>setCurrency(cur)}>{cur}</button>)}</div></div><div className="finance-rate-note">{rates?`Reference rates ${rates.date} · ${ratesError?'Using cached rates':'Frankfurter'}`:'Rates unavailable · amounts requiring conversion will not be guessed'}</div></div>
        <div className="metrics-grid finance-metrics"><Metric icon={ArrowDownLeft} label="Gross collections" value={shortMoney(financeCollected)} detail="Received & recorded" tone="green"/><Metric icon={Clock3} label="Awaiting payment" value={shortMoney(financePending)} detail="Recorded pending income" tone="orange"/><Metric icon={ArrowUpRight} label="Expenses paid" value={shortMoney(financeSpent)} detail="Recorded expenses" tone="rose"/><Metric icon={CircleDollarSign} label="Net recorded cash flow" value={shortMoney(financeCollected-financeSpent)} detail="Paid income − paid expenses" tone="purple"/></div>
        <div className="finance-two-panel"><Panel className="revenue-panel"><div className="panel-header"><div><div className="eyebrow">CASH FLOW HISTORY</div><h2>Revenue vs. expenses</h2><p>Paid transactions · last six months</p></div><Badge>Monthly</Badge></div>{chartHasData?<div className="chart-wrap finance-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={transactionsByMonth} barGap={4} barCategoryGap="29%"><CartesianGrid vertical={false} stroke="#253b37" strokeDasharray="3 6"/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fill:'#91a6a1',fontSize:11}} dy={10}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#91a6a1',fontSize:10}} tickFormatter={v=>shortMoney(Number(v))}/><Tooltip cursor={{fill:'#16b8a610'}} contentStyle={{background:'#14211f',border:'1px solid #2b655a',borderRadius:10,color:'#fff'}} formatter={v=>money(Number(v)||0)}/><Bar dataKey="income" name="Gross collections" fill="#14b8a6" radius={[5,5,0,0]}/><Bar dataKey="expense" name="Paid expenses" fill="#688079" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>:<div className="chart-empty"><BarChart3 size={25}/><b>Your revenue graph starts here</b><span>Record paid income and expenses to see monthly trends.</span></div>}</Panel><Panel className="finance-forecast"><div className="panel-header"><div><div className="eyebrow">LOOKING AHEAD</div><h2>Upcoming payments</h2><p>Recorded pending income with a due date</p></div><CalendarClock size={20}/></div><div className="forecast-list">{data.transactions.filter(t=>t.kind==='Income'&&t.status==='Pending'&&t.date).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6).map(t=><button className="forecast-row" key={t.id} onClick={()=>edit('transaction',t.id)}><span className={`forecast-date ${isOverdue(t.date)?'date-overdue':''}`}>{formatDateShort(t.date)}</span><span><b>{t.description}</b><small>{getClient(t.clientId)?.name||'General payment'}</small></span><strong>{money(t.amount,t.currency||'DKK')}</strong></button>)}{!data.transactions.some(t=>t.kind==='Income'&&t.status==='Pending')&&<div className="hub-empty-line">No upcoming payments recorded.</div>}</div></Panel></div>
        <Panel><div className="panel-header"><div><div className="eyebrow">ACCOUNTING OVERVIEW</div><h2>Transactions</h2><p>Track paid income, upcoming payments, and expenses in their original currencies.</p></div><Badge>{data.transactions.length} entries</Badge></div><div className="finance-table-filters">{([['all','All records'],['income','Collected'],['pending','Pending'],['expense','Expenses']] as const).map(([key,label])=><button key={key} className={financeFilter===key?'active':''} onClick={()=>setFinanceFilter(key)}>{label}</button>)}</div><div className="transaction-table-scroll"><table className="data-table finance-table"><thead><tr><th>TRANSACTION</th><th>CLIENT</th><th>DATE</th><th>TYPE</th><th>STATUS</th><th className="align-right">AMOUNT</th><th/></tr></thead><tbody>{[...financeRows].sort((a,b)=>b.date.localeCompare(a.date)).map(t=><tr key={t.id} onClick={()=>edit('transaction',t.id)}><td><span className="money-name"><span className={`money-icon ${t.kind==='Income'?'income-icon':'expense-icon'}`}>{t.kind==='Income'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span>{t.description}</span></td><td>{getClient(t.clientId)?.name || '—'}</td><td>{formatDate(t.date)}</td><td>{t.kind}</td><td><Badge tone={statusColor[t.status]} dot>{t.status}</Badge></td><td className={`align-right amount-cell ${t.kind==='Income'?'positive':'negative'}`}>{t.kind==='Income'?'+':'−'}{money(t.amount,t.currency||'DKK')}</td><td><ChevronRight size={15}/></td></tr>)}</tbody></table></div>{!data.transactions.length&&<Empty icon={Wallet} title="No transactions yet" description="Add your first payment or expense to start seeing real numbers." action="Add transaction" onAction={()=>add('transaction')}/>}</Panel>
        <div className="finance-insights-grid"><Panel className="finance-insight-card"><div className="panel-header"><div><div className="eyebrow">TOP CLIENTS</div><h2>Collections by client</h2><p>Collected payments only</p></div><Users size={20}/></div>{topClientRevenue.length?topClientRevenue.map((item,i)=><button className="finance-insight-row" key={item.id} onClick={()=>openClient(item.id)}><span>{i+1}. {item.name}</span><b>{money(item.value)}</b><ArrowUpRight size={14}/></button>):<div className="hub-empty-line">Your top clients will appear as you record paid income.</div>}</Panel><Panel className="finance-insight-card"><div className="panel-header"><div><div className="eyebrow">PREDICTABLE INCOME</div><h2>Active retainers</h2><p>Expected recurring agreements, not collected revenue</p></div><RefreshCcw size={20}/></div>{activeRetainers.length?activeRetainers.map(p=><button className="finance-insight-row" key={p.id} onClick={()=>openProject(p.id)}><span>{getClient(p.clientId)?.name||'Client'} · {p.name}</span><b>{p.dealValue===null?'Not set':money(p.dealValue,p.currency)+'/mo'}</b><ArrowUpRight size={14}/></button>):<div className="hub-empty-line">Add a retainer-type project to see ongoing agreements.</div>}</Panel></div>
        <div className="finance-note"><AlertCircle size={17}/><span>Gross collections include verified Stripe receipts and historical manual transactions. Stripe receipts are read-only. Totals include applicable VAT; they are not tax-exclusive revenue. Foreign currency conversions use reference exchange rates, not transaction-date rates; results are indicative, not formal bookkeeping or bank balances. Pending amounts are excluded from collected revenue.</span></div>
      </>}

      {!hub && page === 'settings' && <>
        <PageHeading kicker="YOUR WORKSPACE" title="Settings" description="Control your data, backups and private workspace setup."/>
        <details className="panel settings-disclosure"><summary>Automations</summary><AutomationCenter data={data} setData={setData}/></details><ProjectAgreements data={data} setData={setData} db={db} session={session}/><div className="settings-grid"><Panel className="settings-panel"><div className="settings-icon"><ShieldCheck size={21}/></div><h2>Privacy & storage</h2><p>{cloudEnabled ? 'Your workspace uses Supabase Authentication and an owner-only database policy.' : 'Your current workspace is a browser-only preview. No password protection is active.'}</p><div className="setting-row"><span>Storage mode</span><Badge tone={cloudEnabled?'green':'amber'}>{cloudEnabled?'Private cloud':'Local browser'}</Badge></div><div className="setting-row"><span>Sync status</span><span className="setting-value">{sync==='saved'?'Up to date':sync==='saving'?'Saving…':sync==='error'?'Error':'Local only'}</span></div>{syncError&&<div className="inline-error"><AlertCircle size={15}/>{syncError}</div>}{!cloudEnabled&&<p className="setting-hint">To enable private login and sync, add Supabase environment variables to Netlify and run the included SQL schema. See README.md.</p>}</Panel>
          <Panel className="settings-panel"><div className="settings-icon"><HardDrive size={21}/></div><h2>Backup & restore</h2><p>Download a portable JSON backup. Restore it on any PAID HUSTLE installation.</p><button className="btn btn-subtle settings-button" onClick={exportBackup}><Download size={16}/>Export all data</button><button className="btn btn-subtle settings-button" onClick={()=>fileInput.current?.click()}><Upload size={16}/>Import backup</button><input ref={fileInput} type="file" accept="application/json,.json" style={{display:'none'}} onChange={importBackup}/><p className="setting-hint">Importing a backup replaces the entire current workspace after confirmation.</p></Panel>
          {cloudEnabled&&<Panel className="settings-panel"><div className="settings-icon"><HardDrive size={21}/></div><h2>Protected cloud backups</h2><p>When the optional nightly backup job is configured, recent server-side snapshots appear here for download. The job retains up to 30 days.</p>{backupHistory.map(item=><div className="setting-row" key={item.id}><span>{item.backup_day}</span><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn btn-subtle btn-sm" onClick={()=>void downloadCloudBackup(item.id)}><Download size={14}/>Download</button><button className="btn btn-subtle btn-sm" onClick={()=>void restoreCloudBackup(item.id)}><RefreshCcw size={14}/>Restore</button></div></div>)}{!backupHistory.length&&<p className="setting-hint">{backupStatus||'No scheduled cloud backups found yet.'}</p>}</Panel>}
          <Panel className="settings-panel"><div className="settings-icon"><Activity size={21}/></div><h2>Workspace summary</h2><p>A quick look at the records stored in your personal agency OS.</p><div className="setting-row"><span>Clients</span><b>{data.clients.length}</b></div><div className="setting-row"><span>Sales leads</span><b>{data.leads.length}</b></div><div className="setting-row"><span>Tasks</span><b>{data.tasks.length}</b></div><div className="setting-row"><span>Transactions</span><b>{data.transactions.length}</b></div><div className="setting-row"><span>Display currency</span><b>{displayCurrency}</b></div></Panel>
          <WorkspaceHealth data={data} onClient={openClient} onLead={id=>edit('lead',id)} onProject={openProject} onTask={id=>edit('task',id)}/>
          <Panel className="settings-panel"><div className="settings-icon"><SlidersHorizontal size={21}/></div><h2>Navigation preferences</h2><p>Choose which sections appear in your sidebar and adjust their order. Overview and Settings always remain accessible.</p>
            {navOrder.map((name,i)=><div className="setting-row nav-setting-row" key={name}><label><input type="checkbox" disabled={name==='overview'} checked={name==='overview'||!hiddenPages.includes(name)} onChange={event=>updatePageVisibility(name,event.target.checked)}/><span>{pageNames[name]}</span></label><div className="nav-reorder"><button title={`Move ${pageNames[name]} up`} aria-label={`Move ${pageNames[name]} up`} disabled={i===0} onClick={()=>moveNavPage(name,-1)}><ChevronUp size={16}/></button><button title={`Move ${pageNames[name]} down`} aria-label={`Move ${pageNames[name]} down`} disabled={i===navOrder.length-1} onClick={()=>moveNavPage(name,1)}><ChevronDown size={16}/></button></div></div>)}
            <button className="btn btn-subtle btn-sm" onClick={()=>setData(prev=>({...prev,preferences:{...prev.preferences,hiddenPages:[],navOrder:NAV_PAGES}}))}>Reset navigation</button>
          </Panel>
          <Panel className="settings-panel"><div className="settings-icon"><SlidersHorizontal size={21}/></div><h2>Customize Kanban pipelines</h2><p>Adjust your sales and delivery stages. Stages containing records cannot be removed; Won, Lost and Completed are protected.</p>
            {([['lead',salesPipeline,newSalesStage,setNewSalesStage],['project',projectPipeline,newProjectStage,setNewProjectStage]] as const).map(([kind,stages,newStage,setNewStage])=><div key={kind} className="pipeline-settings-group"><strong>{kind==='lead'?'Sales pipeline':'Project pipeline'}</strong>{stages.map((stage,index)=><div className="pipeline-setting" key={stage}><span>{stage}</span><button aria-label={`Move ${stage} up`} disabled={index===0} onClick={()=>movePipelineStage(kind,stage,-1)}><ChevronUp size={15}/></button><button aria-label={`Move ${stage} down`} disabled={index===stages.length-1} onClick={()=>movePipelineStage(kind,stage,1)}><ChevronDown size={15}/></button><button title="Remove empty stage" aria-label={`Remove ${stage}`} onClick={()=>deletePipelineStage(kind,stage)}><X size={15}/></button></div>)}<div className="pipeline-add"><input aria-label={`New ${kind} stage`} value={newStage} onChange={e=>setNewStage(e.target.value)} maxLength={48} placeholder="New stage name"/><button className="btn btn-subtle btn-sm" onClick={()=>addPipelineStage(kind)}><Plus size={14}/>Add stage</button></div></div>)}
          </Panel>
          <Panel className="settings-panel"><div className="settings-icon"><LayoutDashboard size={21}/></div><h2>Overview dashboard widgets</h2><p>Choose which blocks appear on the Overview page.</p>{([['metrics','KPI cards'],['dashboard','Finance chart and tasks'],['bottom','Projects and upcoming follow-ups']] as const).map(([key,label])=><div className="setting-row" key={key}><span>{label}</span><label><input type="checkbox" checked={!hiddenWidgets.includes(key)} onChange={e=>setData(prev=>({...prev,preferences:{...prev.preferences,hiddenDashboardWidgets:e.target.checked?(prev.preferences.hiddenDashboardWidgets||[]).filter(k=>k!==key):[...(prev.preferences.hiddenDashboardWidgets||[]),key]}}))}/><span style={{marginLeft:8}}>{!hiddenWidgets.includes(key)?'Visible':'Hidden'}</span></label></div>)}<button className="btn btn-subtle btn-sm" onClick={()=>setData(prev=>({...prev,preferences:{...prev.preferences,hiddenDashboardWidgets:[]}}))}>Restore dashboard defaults</button></Panel>
          <Panel className="settings-panel"><div className="settings-icon"><Upload size={21}/></div><h2>Import CRM leads from CSV</h2><p>Import a CSV exported from Notion or a spreadsheet. Include a Company or Name column. Optional fields: Contact, Email, Phone, Source, Value, Notes. Duplicates are skipped using email or company.</p><button className="btn btn-subtle settings-button" onClick={()=>csvInput.current?.click()}><Upload size={16}/>Choose CSV file</button></Panel>
          <Panel className="settings-panel"><div className="settings-icon"><Download size={21}/></div><h2>Export spreadsheets</h2><p>Download a CSV of your current records for review or use in Excel, Numbers or Google Sheets.</p>{(['clients','projects','leads','tasks','transactions'] as const).map(kind=><button key={kind} className="btn btn-subtle settings-button" onClick={()=>exportCsv(kind)}><Download size={15}/>Export {kind} CSV</button>)}</Panel>
          <Panel className="settings-panel"><div className="settings-icon"><Activity size={21}/></div><h2>Recent activity</h2><p>Changes made through operations and the main record editor appear here as a lightweight history.</p>{(data.activityLog||[]).slice(0,12).map(entry=><div className="setting-row" key={entry.id}><span>{entry.label}</span><small>{new Date(entry.date).toLocaleDateString('en-GB')}</small></div>)}{!(data.activityLog||[]).length&&<p className="setting-hint">No recorded activity yet.</p>}</Panel>
          <Panel className="settings-panel"><div className="settings-icon"><FolderKanban size={21}/></div><h2>Archive & restore</h2><p>Archived clients and projects are hidden from active boards, but their saved information is preserved.</p>{data.clients.filter(c=>c.archivedAt).map(c=><div className="setting-row" key={c.id}><span>Client: {c.name}</span><button className="btn btn-subtle btn-sm" onClick={()=>setData(prev=>({...prev,clients:prev.clients.map(item=>item.id===c.id?{...item,archivedAt:undefined}:item)}))}>Restore</button></div>)}{(data.projects||[]).filter(p=>p.archivedAt).map(p=><div className="setting-row" key={p.id}><button className="archive-project-link" onClick={()=>openProject(p.id)}>Project: {p.name} · View agreements</button><button className="btn btn-subtle btn-sm" onClick={()=>setData(prev=>({...prev,projects:(prev.projects||[]).map(item=>item.id===p.id?{...item,archivedAt:undefined}:item)}))}>Restore</button></div>)}{!data.clients.some(c=>c.archivedAt)&&!(data.projects||[]).some(p=>p.archivedAt)&&<p className="setting-hint">No archived client or project records.</p>}</Panel>
          <Panel className="settings-panel danger-panel"><div className="settings-icon"><Trash2 size={21}/></div><h2>Clear workspace</h2><p>Start fresh with no clients, tasks, leads or financial entries. Export your data first.</p><button className="btn btn-danger settings-button" onClick={clearWorkspace}><Trash2 size={16}/>Delete all records</button></Panel></div>
      </>}
      {hub?.type==='project'&&getProject(hub.id)&&<ProjectHub key={hub.id} project={getProject(hub.id)!} client={getClient(getProject(hub.id)!.clientId)} tasks={data.tasks} transactions={data.transactions} formatAmount={money} toBase={(value,source='DKK')=>converted(value,source,'DKK')} onBack={()=>setHub(null)} onOpenClient={()=>openClient(getProject(hub.id)!.clientId)} onEditProject={()=>editProject(hub.id)} onUpdate={(patch,msg)=>updateProject(hub.id,patch,msg)} onAddTask={()=>add('task',getProject(hub.id)!.clientId,hub.id)} onEditTask={id=>edit('task',id)} onToggleTask={toggleTask} onAddTransaction={()=>add('transaction',getProject(hub.id)!.clientId,hub.id)} onEditTransaction={id=>edit('transaction',id)} onArchive={()=>archiveProject(hub.id)} stageOptions={projectPipeline} agreements={<ProjectAgreements projectId={hub.id} data={data} setData={setData} db={db} session={session}/>}/>}
      {hub?.type==='client'&&getClient(hub.id)&&<ClientHub key={hub.id} client={getClient(hub.id)!} projects={projects} tasks={data.tasks} transactions={data.transactions} fmt={money} onBack={()=>setHub(null)} onEdit={()=>edit('client',hub.id)} onNewProject={()=>addProject(hub.id)} onOpenProject={openProject} onArchive={()=>archiveClient(hub.id)}/>}
      <footer className="main-footer"><span>© {new Date().getFullYear()} Strategy Scale <i/> Made for building better businesses.</span><span>PRIVATE WORKSPACE <span className="footer-star">✳</span> V4 DESIGN PREVIEW</span></footer>
    </main></div>
    {dialog && editingItem && <Editor kind={dialog.kind} item={editingItem} clients={data.clients} projects={projects} isNew={!dialog.id} onClose={()=>setDialog(null)} onSave={save} onDelete={remove} onConvertLead={convertLead} onPrepareProposal={leadProposal} leadStageOptions={salesPipeline}/>}
    {projectDialog&&editingProject&&<ProjectEditor key={projectDialog.id||'new-project'} project={editingProject} clients={data.clients} isNew={!projectDialog.id} onClose={()=>setProjectDialog(null)} onSave={saveProject} onDelete={deleteProject} stageOptions={projectPipeline}/>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>
}

function Metric({ icon: Icon, label, value, detail, tone, onClick }: { icon: typeof Users, label: string, value: string, detail: string, tone: string, onClick?:()=>void }) {
  const Wrapper = onClick ? 'button' : 'div'
  return <Wrapper className={`metric-card ${onClick?'metric-clickable':''}`} onClick={onClick}><div className="metric-row"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={19}/></span></div><strong>{value}</strong><div className="metric-foot"><span className={`metric-spark spark-${tone}`}>✳</span>{detail}</div></Wrapper>
}
function PageHeading({ kicker, title, description, action, onAction }: { kicker: string, title: string, description: string, action?: string, onAction?:()=>void }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action&&onAction&&<button className="btn btn-primary" onClick={onAction}><Plus size={18}/>{action}</button>}</div>
}
