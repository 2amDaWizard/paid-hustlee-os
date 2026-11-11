import { AlertCircle, ArrowRight, CalendarClock, Check, CheckCircle2, CircleDollarSign, Clock3, FolderKanban, ListTodo, Plus, Target } from 'lucide-react'
import type { Workspace } from './types'
import {isActiveProject} from './agency-rules'
import { formatDate, isOverdue, today } from './data'

type FocusItem = {
  id: string
  kind: 'task' | 'lead' | 'project'
  title: string
  detail: string
  date: string
  priority: number
}

type Props = {
  data: Workspace
  onOpenTask: (id: string) => void
  onCompleteTask: (id: string) => void
  onOpenLead: (id: string) => void
  onOpenProject: (id: string) => void
  onAddTask: () => void
  onOpenFinance: () => void
}

function addDays(count: number): string {
  const date = new Date()
  date.setDate(date.getDate() + count)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

export default function FocusPage({ data, onOpenTask, onCompleteTask, onOpenLead, onOpenProject, onAddTask, onOpenFinance }: Props) {
  const current = today()
  const weekEnd = addDays(7)
  const projects = data.projects || []
  const activeLeads = data.leads.filter(lead => lead.stage !== 'Closed Won' && lead.stage !== 'Lost')
  const clientName = (id: string) => data.clients.find(client => client.id === id)?.name || 'General'

  const items: FocusItem[] = [
    ...data.tasks.filter(task => !task.done && task.dueDate && task.dueDate <= weekEnd).map(task => ({
      id: task.id, kind: 'task' as const, title: task.title, detail: `${clientName(task.clientId)} · Task`,
      date: task.dueDate, priority: task.priority === 'High' ? 0 : task.priority === 'Medium' ? 1 : 2
    })),
    ...activeLeads.filter(lead => lead.followUp && lead.followUp <= weekEnd && !data.tasks.some(t=>t.id===`auto:lead:${lead.id}:${lead.followUp}`)).map(lead => ({
      id: lead.id, kind: 'lead' as const, title: `Follow up: ${lead.company}`, detail: 'Sales CRM · Follow-up', date: lead.followUp, priority: 1
    })),
    ...projects.filter(project => isActiveProject(project) && !data.tasks.some(t=>t.id===`auto:project:${project.id}:${project.nextFollowUp}`) && project.nextFollowUp && project.nextFollowUp <= weekEnd).map(project => ({
      id: project.id, kind: 'project' as const, title: `Follow up: ${project.name}`, detail: `${clientName(project.clientId)} · Project`, date: project.nextFollowUp, priority: 1
    })),
    ...projects.filter(project => isActiveProject(project) && project.deadline && project.deadline <= weekEnd).map(project => ({
      id: project.id, kind: 'project' as const, title: `Deadline: ${project.name}`, detail: `${clientName(project.clientId)} · Project`, date: project.deadline, priority: 0
    }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority)

  const overdue = items.filter(item => item.date < current)
  const dueToday = items.filter(item => item.date === current)
  const upcoming = items.filter(item => item.date > current)
  const unscheduled = data.tasks.filter(task => !task.done && !task.dueDate && task.priority === 'High')
  const unpaid = data.transactions.filter(item => item.kind === 'Income' && item.status === 'Pending')

  const open = (item: FocusItem) => {
    if (item.kind === 'task') onOpenTask(item.id)
    else if (item.kind === 'lead') onOpenLead(item.id)
    else onOpenProject(item.id)
  }
  const section = (title: string, sectionItems: FocusItem[], empty: string, tone: string) => (
    <section className="focus-section" key={title}>
      <div className="focus-section-heading"><div><span className={`focus-dot focus-dot-${tone}`}/><h2>{title}</h2></div><span>{sectionItems.length}</span></div>
      {sectionItems.length ? sectionItems.map(item => <div key={`${item.kind}-${item.id}-${item.title}`} className="focus-row">
        <span className="focus-row-symbol">{item.kind === 'task' ? <ListTodo size={17}/> : item.kind === 'lead' ? <Target size={17}/> : <FolderKanban size={17}/>}</span>
        <button className="focus-row-info" onClick={() => open(item)}><strong>{item.title}</strong><span>{item.detail} · {formatDate(item.date)}</span></button>
        {item.kind === 'task' ? <button className="btn btn-subtle btn-sm" onClick={() => onCompleteTask(item.id)} title="Mark task completed"><Check size={14}/> Done</button> : <button className="focus-open" onClick={() => open(item)} aria-label={`Open ${item.title}`}><ArrowRight size={17}/></button>}
      </div>) : <p className="focus-empty">{empty}</p>}
    </section>
  )

  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> DAILY COMMAND CENTER</div><h1>Today's Focus</h1><p>The work and follow-ups that deserve your attention first.</p></div><button className="btn btn-primary" onClick={onAddTask}><Plus size={17}/>New task</button></div>
    <div className="focus-summary">
      <div className="focus-summary-card"><AlertCircle size={18}/><span>Overdue</span><strong>{overdue.length}</strong></div>
      <div className="focus-summary-card"><Clock3 size={18}/><span>Due today</span><strong>{dueToday.length}</strong></div>
      <div className="focus-summary-card"><CalendarClock size={18}/><span>Next 7 days</span><strong>{upcoming.length}</strong></div>
      <button className="focus-summary-card focus-summary-button" onClick={onOpenFinance}><CircleDollarSign size={18}/><span>Payments to review</span><strong>{unpaid.length}</strong></button>
    </div>
    <div className="focus-board">
      {section('Overdue', overdue, 'Nothing overdue. Nice work.', 'rose')}
      {section('Due today', dueToday, 'No deadlines or follow-ups scheduled for today.', 'teal')}
      {section('Next 7 days', upcoming, 'Nothing else scheduled this week.', 'blue')}
    </div>
    {unscheduled.length > 0 && <section className="focus-section focus-unscheduled"><div className="focus-section-heading"><div><span className="focus-dot focus-dot-amber"/><h2>High-priority tasks without dates</h2></div><span>{unscheduled.length}</span></div>{unscheduled.map(task => <div className="focus-row" key={task.id}><span className="focus-row-symbol"><ListTodo size={17}/></span><button className="focus-row-info" onClick={() => onOpenTask(task.id)}><strong>{task.title}</strong><span>{clientName(task.clientId)} · Add a due date to schedule it</span></button><button className="btn btn-subtle btn-sm" onClick={() => onCompleteTask(task.id)}><Check size={14}/> Done</button></div>)}</section>}
    <div className="focus-hint"><CheckCircle2 size={17}/>Only dates you have recorded are used. Pending transactions are counted for review, not treated as overdue invoices without explicit payment due dates.</div>
  </>
}
