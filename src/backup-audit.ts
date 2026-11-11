import type { Workspace } from './types'

export type BackupCollection = 'clients' | 'projects' | 'leads' | 'tasks' | 'transactions' | 'operations' | 'activityLog'
export const BACKUP_COLLECTIONS: BackupCollection[] = ['clients','projects','leads','tasks','transactions','operations','activityLog']
export type BackupAudit = { counts: Record<BackupCollection,number>; errors:string[]; warnings:string[]; projectValueByCurrency:Record<string,number> }

/** Validate links and duplicate IDs before a backup is allowed to overwrite a workspace.
 * Only structurally destructive problems are errors; optional blank fields are warnings.
 */
export function auditWorkspaceBackup(workspace:Workspace): BackupAudit {
  const errors:string[] = []
  const warnings:string[] = []
  const counts = {} as Record<BackupCollection,number>
  const ids = {} as Record<BackupCollection,Set<string>>
  for (const kind of BACKUP_COLLECTIONS) {
    const records = workspace[kind] ?? []
    counts[kind] = records.length
    ids[kind] = new Set<string>()
    for (let index=0; index<records.length;index++) {
      const item = records[index] as {id?:unknown}
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        errors.push(`${kind} record ${index+1} has an invalid ID`)
        continue
      }
      if (ids[kind].has(item.id)) errors.push(`${kind} contains duplicate ID ${item.id}`)
      ids[kind].add(item.id)
    }
  }
  for (const project of workspace.projects??[]) {
    if (!ids.clients.has(project.clientId)) errors.push(`Project "${project.name}" refers to a missing client`)
  }
  for (const kind of ['tasks','transactions','operations'] as const) {
    for (const record of workspace[kind]??[]) {
      if (record.clientId && !ids.clients.has(record.clientId)) errors.push(`${kind} record ${record.id} refers to a missing client`)
      if (record.projectId && !ids.projects.has(record.projectId)) errors.push(`${kind} record ${record.id} refers to a missing project`)
      if (record.projectId && ids.projects.has(record.projectId)) {
        const project = workspace.projects?.find(p=>p.id===record.projectId)
        if (record.clientId && project?.clientId!==record.clientId) errors.push(`${kind} record ${record.id} links a project belonging to another client`)
      }
    }
  }
  if (!workspace.preferences || typeof workspace.preferences.agencyName!=='string') errors.push('Workspace preferences are missing or invalid')
  const projectValueByCurrency:Record<string,number>={}
  for (const project of workspace.projects??[]) {
    if (project.dealValue!=null && (!Number.isFinite(project.dealValue)||project.dealValue<0)) errors.push(`Project "${project.name}" has invalid deal value`)
    if (project.dealValue!=null && Number.isFinite(project.dealValue)) {
      const currency=project.currency||'Unspecified'
      projectValueByCurrency[currency]=(projectValueByCurrency[currency]||0)+project.dealValue
    }
  }
  if ((workspace.projects??[]).length===0 && workspace.clients.length>0) warnings.push('No projects exist in this backup; legacy clients may be converted into projects during import')
  if (workspace.operations===undefined) warnings.push('This older backup has no operations records')
  if (workspace.activityLog===undefined) warnings.push('This older backup has no global activity history')
  return {counts,errors,warnings,projectValueByCurrency}
}
