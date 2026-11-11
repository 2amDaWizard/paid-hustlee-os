import {useState} from 'react'
import type {MergeConflict} from './workspace-merge'
export default function SyncNotice({status,message,retry,conflicts,resolve}:{status:string;message:string;retry:()=>void;conflicts:MergeConflict[];resolve:(c:Record<string,'local'|'remote'>)=>void}){
  const [choices,setChoices]=useState<Record<string,'local'|'remote'>>({})
  if(!['error','conflict'].includes(status)&&!message)return null
  return <section className="sync-notice" aria-live="polite"><strong>{status==='conflict'?'Review conflicting edits':'Changes need attention'}</strong><p>{message}</p>{conflicts.map(c=><div className="sync-conflict" key={c.path}><b>{c.label} · {c.path.split('.').at(-1)}</b><label><input type="radio" name={c.path} checked={choices[c.path]==='local'} onChange={()=>setChoices(v=>({...v,[c.path]:'local'}))}/>This tab: <code>{JSON.stringify(c.local)??'Deleted'}</code></label><label><input type="radio" name={c.path} checked={choices[c.path]==='remote'} onChange={()=>setChoices(v=>({...v,[c.path]:'remote'}))}/>Cloud: <code>{JSON.stringify(c.remote)??'Deleted'}</code></label></div>)}{conflicts.length?<button className="btn btn-primary" disabled={conflicts.some(c=>!choices[c.path])} onClick={()=>{resolve(choices);setChoices({})}}>Keep selected versions</button>:<button className="btn btn-subtle" onClick={retry}>Retry now</button>}</section>
}
