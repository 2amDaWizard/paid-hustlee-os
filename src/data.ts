import type { Workspace, Client, Lead, Task, Transaction, Project, Currency } from './types'

export const uid = (): string => crypto.randomUUID()
export const today = () => new Date().toLocaleDateString('en-CA')
export const formatDate = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const formatMoney = (amount: number, currency: Currency = 'DKK') => new Intl.NumberFormat('en-DK', { style: 'currency', currency, maximumFractionDigits: currency === 'DKK' ? 0 : 2 }).format(amount)
export const money = (amount: number) => formatMoney(amount)
export const shortMoney = (amount: number) => amount >= 1000000 ? `${(amount/1000000).toFixed(1)}m kr` : amount >= 10000 ? `${(amount/1000).toFixed(1)}k kr` : money(amount)
export const isOverdue = (date: string) => Boolean(date && date < today())
export const isUpcoming = (date: string) => Boolean(date && date >= today())

// Client names and sensitive information are not embedded in the public frontend bundle.
export function starterWorkspace(): Workspace { return emptyWorkspace() }
export function emptyWorkspace(): Workspace { return { version: 1, clients: [], projects: [], leads: [], tasks: [], transactions: [], operations: [], activityLog: [], preferences: { currency: 'DKK', agencyName: 'PAID HUSTLE' } } }

export function validateWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  if (a.version !== 1 || !Array.isArray(a.clients) || !Array.isArray(a.leads) || !Array.isArray(a.tasks) || !Array.isArray(a.transactions)) return false
  if (a.projects !== undefined && !Array.isArray(a.projects)) return false
  if (a.operations !== undefined && (!Array.isArray(a.operations)||!a.operations.every(op=>op&&typeof op==='object'&&typeof op.id==='string'&&typeof op.title==='string'&&typeof op.category==='string'&&typeof op.url==='string'&&Array.isArray(op.checklist)))) return false
  if (a.activityLog !== undefined && !Array.isArray(a.activityLog)) return false
  const good = (items: unknown[], fields: string[]) => items.every(row => typeof row === 'object' && row !== null && fields.every(field => field in row))
  return good(a.clients, ['id','name','status','services']) && good(a.leads, ['id','company','stage']) && good(a.tasks, ['id','title','done']) && good(a.transactions, ['id','description','amount','kind','status']) && (a.projects === undefined || good(a.projects as unknown[], ['id','clientId','name','status']))
}

export const defaultClient = (): Client => ({id: uid(), name: '', status: 'Onboarding', services: [], priority: 'Medium', dealType: 'One-off', dealValue: null, currency: 'DKK', revenueSharePercent: null, contact: '', email: '', phone: '', folderUrl: '', websiteUrl: '', nextAction: '', nextFollowUp: '', deadline: '', notes: '', createdAt: today()})
export const defaultLead = (): Lead => ({id: uid(), company: '', contact: '', email: '', phone: '', services: [], nextAction: '', lastContact: '', currency: 'DKK', stage: 'Lead', lostReason: 'Not recorded', source: '', value: null, followUp: '', notes: '', createdAt: today()})
export const defaultTask = (): Task => ({id: uid(), title: '', subtasks: [], clientId: '', projectId: '', dueDate: '', priority: 'Medium', done: false, notes: '', createdAt: today()})
export const defaultTransaction = (): Transaction => ({id: uid(), description: '', clientId: '', projectId: '', currency: 'DKK', amount: 0, kind: 'Income', status: 'Pending', date: today(), notes: '', createdAt: today()})
export const defaultProject = (clientId = ''): Project => ({
  id: uid(), clientId, name: '', status: 'Onboarding', priority: 'Medium', services: [], dealType: 'One-off', dealValue: null, currency: 'DKK', revenueSharePercent: null,
  startDate: today(), deadline: '', nextAction: '', nextFollowUp: '', description: '', brief: '', notes: '',
  milestones: [], deliverables: [], links: [], activity: [], createdAt: today(), updatedAt: new Date().toISOString()
})

// Non-destructive v1 -> v1+projects expansion. Every legacy client gets a project
// representing its old single-card delivery work, retaining original fields.
// Existing v2 workspaces are not re-migrated on subsequent loads.
export function upgradeWorkspace(raw: Workspace): Workspace {
  if (Array.isArray(raw.projects)) return {
    ...raw,
    projects: raw.projects.map(p => ({...defaultProject(p.clientId), ...p,
      milestones: Array.isArray(p.milestones) ? p.milestones : [],
      deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
      links: Array.isArray(p.links) ? p.links : [], activity: Array.isArray(p.activity) ? p.activity : [] })),
    operations: Array.isArray(raw.operations)?raw.operations:[], activityLog:Array.isArray(raw.activityLog)?raw.activityLog:[],
    preferences: {...raw.preferences, currency: raw.preferences?.currency || 'DKK'}
  }
  const projects: Project[] = raw.clients.map(client => ({
    ...defaultProject(client.id),
    id: `legacy-${client.id}`, clientId: client.id,
    name: client.services?.length ? client.services.join(' + ') : `${client.name} · Main project`,
    status: client.status || 'Onboarding', priority: client.priority || 'Medium', services: client.services || [],
    dealType: client.dealType || 'One-off', dealValue: client.dealValue, currency: client.currency || 'DKK',
    nextAction: client.nextAction || '', nextFollowUp: client.nextFollowUp || '',
    deadline: client.deadline || '', notes: client.notes || '', createdAt: client.createdAt || today(),
    links: [client.folderUrl ? {id:uid(),label:'Client folder',url:client.folderUrl} : null,
      client.websiteUrl ? {id:uid(),label:'Client website',url:client.websiteUrl} : null].filter((a): a is {id:string,label:string,url:string} => !!a),
  }))
  return {...raw, projects, operations: Array.isArray(raw.operations)?raw.operations:[],activityLog:[], preferences: {...raw.preferences, currency: raw.preferences?.currency || 'DKK', agencyName:'PAID HUSTLE'} }
}
