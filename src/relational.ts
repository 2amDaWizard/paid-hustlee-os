import {valueEqual} from './value-equal.ts'
import type { Workspace } from './types'

type CollectionKey = 'clients' | 'projects' | 'leads' | 'tasks' | 'transactions' | 'operations' | 'activityLog'
export const COLLECTIONS: CollectionKey[] = ['clients','projects','leads','tasks','transactions','operations','activityLog']
type RecordWithId = {id:string}
type CollectionPatch = {upsert: RecordWithId[];delete: string[]}
export type WorkspacePatch = Partial<Record<CollectionKey,CollectionPatch>> & {preferences?: Workspace['preferences']}

/** Compare record IDs, not array ordering: a drag/reorder that doesn't change data has no database writes. */
export function diffWorkspace(previous: Workspace, next: Workspace): WorkspacePatch | null {
  const delta: WorkspacePatch = {}
  for (const key of COLLECTIONS) {
    const before = (previous[key] ?? []) as RecordWithId[]
    const after = (next[key] ?? []) as RecordWithId[]
    const old = new Map(before.map(row=>[row.id,row]))
    const current = new Set(after.map(row=>row.id))
    const upsert = after.filter(row=>!valueEqual(old.get(row.id),row))
    const deleted = before.filter(row=>!current.has(row.id)).map(row=>row.id)
    if (upsert.length||deleted.length) delta[key] = {upsert,delete:deleted}
  }
  if (!valueEqual(previous.preferences,next.preferences)) delta.preferences=next.preferences
  return Object.keys(delta).length?delta:null
}
