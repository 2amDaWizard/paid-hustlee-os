import {valueEqual} from './value-equal.ts'
import type { Workspace } from './types'
import { COLLECTIONS } from './relational.ts'
export type MergeConflict = { path:string; label:string; local:unknown; remote:unknown }
const equal=valueEqual
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
/** Three-way merge: independent fields merge; competing edits require an explicit choice. */
export function mergeWorkspaces(base:Workspace,local:Workspace,remote:Workspace,choices:Record<string,'local'|'remote'>={}) {
  const conflicts:MergeConflict[]=[]
  const merge=(b:unknown,l:unknown,r:unknown,path:string,label:string):unknown=>{
    if(equal(l,b))return r
    if(equal(r,b)||equal(l,r))return l
    if(object(b)&&object(l)&&object(r))return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].map(k=>[k,merge(b[k],l[k],r[k],`${path}.${k}`,label)]).filter(([,v])=>v!==undefined))
    if(choices[path])return choices[path]==='local'?l:r
    conflicts.push({path,label,local:l,remote:r});return l
  }
  const result={...remote} as Workspace
  for(const key of COLLECTIONS){
    const b=new Map((base[key]||[]).map(x=>[x.id,x])),l=new Map((local[key]||[]).map(x=>[x.id,x])),r=new Map((remote[key]||[]).map(x=>[x.id,x]))
    const rows=[...new Set([...l.keys(),...r.keys(),...b.keys()])].map(id=>{
      const row=(l.get(id)||r.get(id)) as unknown as Record<string,unknown>
      // Signed Stripe receipts are immutable server records, even when a stale browser has edits.
      if(key==='transactions'&&id.startsWith('stripe:'))return r.get(id)
      const merged=merge(b.get(id),l.get(id),r.get(id),`${key}.${id}`,String(row?.title||row?.name||row?.company||row?.description||id))
      const cloud=r.get(id) as unknown as Record<string,unknown>|undefined
      if(key==='operations'&&cloud?.paymentSource==='stripe'&&object(merged)){
        for(const field of ['status','amount','currency','vatRate','paymentSource','stripePaymentId','stripeInvoiceId','clientId','projectId']){
          merged[field]=cloud[field]
          const index=conflicts.findIndex(c=>c.path===`${key}.${id}.${field}`);if(index>=0)conflicts.splice(index,1)
        }
      }
      return merged
    }).filter(Boolean)
    ;(result as unknown as Record<string,unknown>)[key]=rows
  }
  result.preferences=merge(base.preferences,local.preferences,remote.preferences,'preferences','Settings') as Workspace['preferences']
  return {workspace:result,conflicts}
}
