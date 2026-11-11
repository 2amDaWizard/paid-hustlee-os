import { AlertTriangle, CheckCircle2, HeartPulse, Users } from 'lucide-react'
import type { Workspace } from './types'
import { today, formatDate } from './data'
interface Props {data:Workspace;onOpenClient:(id:string)=>void}
export default function ClientHealth({data,onOpenClient}:Props){
  const active=data.clients.filter(c=>!c.archivedAt)
  const health=active.map(client=>{
    const projects=(data.projects||[]).filter(p=>p.clientId===client.id&&!p.archivedAt)
    const overdue=projects.filter(p=>p.deadline&&p.deadline<today()&&p.status!=='Completed')
    const overdueTasks=data.tasks.filter(t=>t.clientId===client.id&&!t.done&&t.dueDate&&t.dueDate<today())
    const dueRenewals=(data.operations||[]).filter(r=>r.category==='renewals'&&r.clientId===client.id&&r.dueDate&&r.dueDate<=new Date(Date.now()+30*86400000).toLocaleDateString('en-CA')&&!['Renewed','Ended'].includes(r.status))
    const overduePayments=data.transactions.filter(t=>t.clientId===client.id&&t.kind==='Income'&&t.status==='Pending'&&t.date<today())
    const issues=[...overdue.map(p=>`Project overdue: ${p.name}`),...overdueTasks.map(t=>`Task overdue: ${t.title}`),...dueRenewals.map(r=>`Renewal review: ${formatDate(r.dueDate)}`),...overduePayments.map(t=>`Review pending payment: ${t.description}`)]
    return {client,issues,status:issues.length?'Needs review':'No current alerts'}
  }).sort((a,b)=>b.issues.length-a.issues.length)
  return <section className="ops-health-overview"><div className="ops-health-head"><div><div className="eyebrow">RELATIONSHIP HEALTH</div><h2>Clients to check on</h2><p>Transparent alerts based on recorded deadlines, renewals, tasks and payments — not an invented happiness score.</p></div><HeartPulse size={24}/></div><div className="ops-health-list">{health.slice(0,8).map(row=><button key={row.client.id} className="ops-health-row" onClick={()=>onOpenClient(row.client.id)}>{row.issues.length?<AlertTriangle size={18} className="ops-health-warning"/>:<CheckCircle2 size={18} className="ops-health-okay"/>}<span><b>{row.client.name}</b><small>{row.issues[0]||row.status}</small></span><em>{row.issues.length?`${row.issues.length} item${row.issues.length===1?'':'s'}`:'On track'}</em></button>)}{!health.length&&<div className="ops-health-empty"><Users size={19}/>Client alerts appear after you add your first client.</div>}</div></section>
}
