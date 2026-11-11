export type ClientStatus = 'Onboarding' | 'In Progress' | 'Client Review' | 'Revisions' | 'Completed' | 'Active Retainer' | (string & {})
export type LeadStage = 'Lead' | 'Outreached' | 'Qualified' | 'Meeting Booked' | 'Proposal Sent' | 'Negotiation' | 'Closed Won' | 'Lost' | (string & {})
export type Priority = 'Low' | 'Medium' | 'High'
export type DealType = 'One-off' | 'Retainer' | 'Revenue Share' | 'Other'
export type Currency = 'DKK' | 'EUR' | 'USD'
export type DeliverableStatus = 'To do' | 'In progress' | 'In review' | 'Approved'

export interface Client {
  archivedAt?: string
  id: string
  name: string
  status: ClientStatus // Legacy field, preserved for existing workspace records.
  services: string[] // Legacy services: migrated into a separate project.
  priority: Priority
  dealType: DealType
  dealValue: number | null
  currency?: Currency
  revenueSharePercent?: number | null
  contact: string
  email: string
  phone: string
  folderUrl: string
  websiteUrl: string
  nextAction: string
  nextFollowUp: string
  deadline: string
  notes: string
  createdAt: string
}

export interface ProjectDeliverable {
  id: string
  title: string
  status: DeliverableStatus
  dueDate: string
}
export interface ProjectMilestone {
  id: string
  title: string
  done: boolean
  dueDate: string
}
export interface ProjectLink {
  id: string
  label: string
  url: string
}
export interface ProjectActivity {
  id: string
  text: string
  at: string
}
export interface Project {
  archivedAt?: string
  id: string
  clientId: string
  name: string
  status: ClientStatus
  priority: Priority
  services: string[]
  dealType: DealType
  dealValue: number | null
  currency: Currency
  revenueSharePercent: number | null
  startDate: string
  deadline: string
  nextAction: string
  nextFollowUp: string
  description: string
  brief: string
  notes: string
  milestones: ProjectMilestone[]
  deliverables: ProjectDeliverable[]
  links: ProjectLink[]
  activity: ProjectActivity[]
  createdAt: string
  updatedAt: string
}

export interface Lead {
  convertedClientId?:string; convertedProjectId?:string
  id: string
  company: string
  contact: string
  email: string
  phone?: string
  services?: string[]
  nextAction?: string
  lastContact?: string
  currency?: Currency
  stage: LeadStage
  source: string
  value: number | null
  followUp: string
  notes: string
  createdAt: string
  lostReason?: string
}

export interface Task {
  sourceRecordId?:string; sourceStepId?:string; cycle?:string
  subtasks?: {id:string; title:string; done:boolean}[]
  id: string
  title: string
  clientId: string
  projectId?: string
  dueDate: string
  priority: Priority
  done: boolean
  notes: string
  createdAt: string
}

export interface Transaction {
  invoiceId?:string; paymentSource?:string; stripePaymentId?:string
  id: string
  description: string
  clientId: string
  projectId?: string
  currency?: Currency
  amount: number
  kind: 'Income' | 'Expense'
  status: 'Paid' | 'Pending'
  date: string
  notes: string
  createdAt: string
}

export type OperationsCategory = 'proposals'|'invoices'|'bookings'|'communications'|'outreach'|'onboarding'|'qa'|'handovers'|'accounts'|'retainers'|'renewals'|'documents'|'templates'|'weekly'|'reports'
export interface ChecklistItem { id:string; label:string; done:boolean }
export interface OperationsRecord {
  leadId?:string; dealType?:DealType; agreementEnd?:string; cycle?:string; paymentSource?:string; stripePaymentId?:string; stripeInvoiceId?:string; stripeCheckoutId?:string; stripeCheckoutExpiresAt?:number; fileDeletedAt?:string;
  filePath?:string; fileMime?:string; fileSize?:number; vatRate?:number
  id:string; category:OperationsCategory; title:string; clientId:string; projectId:string;
  status:string; dueDate:string; amount:number|null; currency:Currency; url:string;
  details:string; checklist:ChecklistItem[]; createdAt:string; updatedAt:string
}
export interface ActivityEvent { id:string; date:string; label:string }

export type AutomationKind = 'overdue-invoice'|'due-lead'|'due-project'|'contract-renewal'|'monthly-retainer'|'completed-project'|'weekly-review'
export type AutomationSettings = { enabled?:Partial<Record<AutomationKind,boolean>>; processed?:string[] }

export interface Workspace {
  version: 1 // Deliberately retain version 1 so existing Supabase JSONB rows remain compatible.
  clients: Client[]
  projects?: Project[]
  leads: Lead[]
  tasks: Task[]
  transactions: Transaction[]
  operations?: OperationsRecord[]
  activityLog?: ActivityEvent[]
  preferences: { currency: Currency; agencyName: string; hiddenPages?: string[]; navOrder?: string[]; readNotificationKeys?: string[]; leadStages?: string[]; projectStages?: string[]; hiddenDashboardWidgets?: string[]; automations?: AutomationSettings; leadStageHistory?:{leadId:string;from:string;to:string;at:string}[] }
}

export type RecordKind = 'client' | 'lead' | 'task' | 'transaction'
export const clientStatuses: ClientStatus[] = ['Onboarding', 'In Progress', 'Client Review', 'Revisions', 'Completed', 'Active Retainer']
export const leadStages: LeadStage[] = ['Lead', 'Outreached', 'Qualified', 'Meeting Booked', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Lost']
export const priorities: Priority[] = ['Low', 'Medium', 'High']
export const dealTypes: DealType[] = ['One-off', 'Retainer', 'Revenue Share', 'Other']
export const currencies: Currency[] = ['DKK', 'EUR', 'USD']
export const services = ['Meta Ads', 'Google Ads', 'Landing Page', 'Website', 'SEO', 'Email Marketing', 'Copywriting', 'Creative Strategy', 'Other']
export const deliverableStatuses: DeliverableStatus[] = ['To do', 'In progress', 'In review', 'Approved']
