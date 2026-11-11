import { AlertTriangle, ArrowUpRight, CheckCircle2, HeartPulse } from 'lucide-react'
import type { Workspace } from './types'

type HealthIssue = { id: string; title: string; description: string; kind: 'client' | 'lead' | 'project' | 'task'; recordId: string }

type Props = {
  data: Workspace
  onClient: (id: string) => void
  onLead: (id: string) => void
  onProject: (id: string) => void
  onTask: (id: string) => void
}

export default function WorkspaceHealth({ data, onClient, onLead, onProject, onTask }: Props) {
  const issues: HealthIssue[] = []
  const seenClientNames = new Map<string, string>()
  for (const client of data.clients) {
    const key = client.name.trim().toLocaleLowerCase()
    if (key && seenClientNames.has(key)) issues.push({ id: `duplicate-client-${client.id}`, title: 'Possible duplicate client', description: `${client.name} shares a name with another client. Review before making changes.`, kind: 'client', recordId: client.id })
    else if (key) seenClientNames.set(key, client.id)
    if (!client.email?.trim() && !client.phone?.trim()) issues.push({ id: `client-contact-${client.id}`, title: 'Client contact details missing', description: `${client.name} has no email address or phone number.`, kind: 'client', recordId: client.id })
  }
  const seenLeadEmails = new Map<string, string>()
  for (const lead of data.leads) {
    const key = lead.email?.trim().toLowerCase()
    if (key && seenLeadEmails.has(key)) issues.push({ id: `duplicate-lead-${lead.id}`, title: 'Possible duplicate lead', description: `${lead.company} shares an email address with another lead.`, kind: 'lead', recordId: lead.id })
    else if (key) seenLeadEmails.set(key, lead.id)
    if (lead.stage !== 'Lost' && lead.stage !== 'Closed Won' && !lead.followUp) issues.push({ id: `lead-followup-${lead.id}`, title: 'No next follow-up planned', description: `${lead.company} is an open opportunity without a follow-up date.`, kind: 'lead', recordId: lead.id })
  }
  for (const project of data.projects || []) {
    if (project.status !== 'Completed' && project.status !== 'Active Retainer' && !project.deadline) issues.push({ id: `project-deadline-${project.id}`, title: 'Project without a deadline', description: `${project.name} has no target delivery date.`, kind: 'project', recordId: project.id })
  }
  const projectIds = new Set((data.projects || []).map(project => project.id))
  for (const task of data.tasks) {
    if (task.projectId && !projectIds.has(task.projectId)) issues.push({ id: `task-project-${task.id}`, title: 'Task links to missing project', description: `${task.title} references a project that no longer exists.`, kind: 'task', recordId: task.id })
  }

  const open = (item: HealthIssue) => {
    if (item.kind === 'client') onClient(item.recordId)
    else if (item.kind === 'lead') onLead(item.recordId)
    else if (item.kind === 'project') onProject(item.recordId)
    else onTask(item.recordId)
  }

  return <section className="panel settings-panel health-panel">
    <div className="settings-icon"><HeartPulse size={21}/></div>
    <h2>Workspace health</h2>
    <p>Suggestions to review, based on existing records. These checks don't edit or delete any information.</p>
    <div className="health-score"><span>{issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'} to review` : 'No issues found by these checks'}</span>{issues.length ? <AlertTriangle size={19}/> : <CheckCircle2 size={19}/>}</div>
    {issues.length > 0 && <div className="health-list">{issues.slice(0, 8).map(issue => <button key={issue.id} onClick={() => open(issue)} className="health-issue"><span><b>{issue.title}</b><small>{issue.description}</small></span><ArrowUpRight size={17}/></button>)}{issues.length > 8 && <p className="setting-hint">And {issues.length - 8} more suggestions. Review important records first.</p>}</div>}
    <p className="setting-hint">Not every field is required. A suggestion can be harmless. No records are automatically merged or deleted.</p>
  </section>
}
