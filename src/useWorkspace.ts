import {useCallback,useEffect,useRef,useState} from 'react'
import type {Dispatch,SetStateAction} from 'react'
import type {Session,SupabaseClient} from '@supabase/supabase-js'
import type {Workspace} from './types'
import {emptyWorkspace,upgradeWorkspace,validateWorkspace} from './data'
import {reconcileWorkflow} from './workflow'
import {diffWorkspace} from './relational'
import {mergeWorkspaces} from './workspace-merge'
import type {MergeConflict} from './workspace-merge'
const LOCAL_KEY='paid-hustlee-workspace-v1'
const draftKey=(owner:string)=>`paid-hustle-draft-v35:${owner}`
export function useWorkspace(db:SupabaseClient|null,cloudEnabled:boolean){
  const initial=()=>{if(cloudEnabled)return emptyWorkspace();try{const raw=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');if(validateWorkspace(raw))return upgradeWorkspace(raw)}catch{}return emptyWorkspace()}
  const [workspace,setState]=useState<Workspace>(initial)
  const current=useRef(workspace),base=useRef<Workspace|null>(null),owner=useRef(''),revision=useRef(0)
  const [session,setSession]=useState<Session|null>(null),[authLoading,setAuthLoading]=useState(cloudEnabled),[loaded,setLoaded]=useState(!cloudEnabled)
  const [sync,setSync]=useState<'local'|'saving'|'saved'|'error'|'conflict'>(cloudEnabled?'saving':'local')
  const [syncError,setSyncError]=useState(''),[conflicts,setConflicts]=useState<MergeConflict[]>([])
  const conflictState=useRef<{base:Workspace;remote:Workspace;revision:number}|null>(null)
  const busy=useRef(false),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),attempt=useRef(0)
  const pump=useRef<()=>Promise<void>>(async()=>{})
  const cache=()=>{if(!owner.current||!base.current)return;try{sessionStorage.setItem(draftKey(owner.current),JSON.stringify({base:base.current,workspace:current.current}))}catch{setSyncError('This tab cannot store a recovery draft. Keep it open until cloud saving finishes, or export a backup.')}}
  const schedule=(delay=400)=>{clearTimeout(timer.current);timer.current=setTimeout(()=>void pump.current(),delay)}
  const setWorkspace:Dispatch<SetStateAction<Workspace>>=useCallback(update=>{
    let next=reconcileWorkflow(typeof update==='function'?update(current.current):update)
    const removed=[...current.current.tasks,...(current.current.operations||[])].filter(r=>r.id.startsWith('auto:')&&![...next.tasks,...(next.operations||[])].some(n=>n.id===r.id)).map(r=>r.id.slice(5))
    if(removed.length)next={...next,preferences:{...next.preferences,automations:{...next.preferences.automations,processed:[...new Set([...(next.preferences.automations?.processed||[]),...removed])]}}}

    if(next===current.current)return
    current.current=next;setState(next)
    if(!db){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(next));setSync('local')}catch{setSync('error');setSyncError('Browser storage is full or unavailable. Export a backup before closing.')}return}
    cache();if(!conflictState.current)setSync('saving');schedule()
  },[db])
  pump.current=async()=>{
    if(!db||!owner.current||busy.current||conflictState.current)return
    const user=owner.current,gen=generation.current
    busy.current=true
    try{
      // Read before every retry: handles both stale tabs and a successful write whose response was lost.
      const {data,error}=await db.rpc('agency_load_workspace')
      if(gen!==generation.current)return
      if(error)throw new Error(error.message)
      if(!validateWorkspace(data))throw new Error('Cloud data failed validation; nothing was overwritten.')
      const remote=upgradeWorkspace(data),rev=Number((data as Workspace & {revision?:number}).revision||0)
      if(!Number.isSafeInteger(rev))throw new Error('Invalid cloud revision')
      if(!base.current){
        base.current=remote
        try{const draft=JSON.parse(sessionStorage.getItem(draftKey(user))||'null');if(draft&&validateWorkspace(draft.base)&&validateWorkspace(draft.workspace)){base.current=draft.base;current.current=draft.workspace}else current.current=remote}catch{current.current=remote}
      }
      const merged=mergeWorkspaces(base.current!,current.current,remote)
      current.current=reconcileWorkflow(merged.workspace);setState(current.current);setLoaded(true)
      if(merged.conflicts.length){conflictState.current={base:base.current!,remote,revision:rev};setConflicts(merged.conflicts);setSync('conflict');setSyncError('The same information changed in another tab or service. Choose which version to keep.');cache();return}
      base.current=remote;revision.current=rev
      const snapshot=current.current,patch=diffWorkspace(remote,snapshot)
      if(patch){
        setSync('saving');cache()
        const {data:nextRevision,error:writeError}=await db.rpc('agency_apply_patch',{p_patch:patch,p_expected_revision:rev})
        if(gen!==generation.current)return
        if(writeError)throw new Error(writeError.message)
        if(!Number.isSafeInteger(Number(nextRevision)))throw new Error('Save acknowledgement missing; checking the server again.')
        base.current=snapshot;revision.current=Number(nextRevision)
      }
      attempt.current=0;setSyncError('')
      if(diffWorkspace(base.current!,current.current)){cache();setSync('saving');schedule(50)}
      else{sessionStorage.removeItem(draftKey(user));setSync('saved')}
    }catch(e){
      if(gen!==generation.current)return
      cache();setSync('error');setSyncError(`${e instanceof Error?e.message:'Connection interrupted'}. Your changes remain in this tab. Retrying automatically.`)
      schedule(Math.min(30000,1000*2**Math.min(attempt.current++,5)))
    }finally{if(gen===generation.current)busy.current=false}
  }
  useEffect(()=>{
    if(!db)return
    let alive=true
    db.auth.getSession().then(({data,error})=>{if(!alive)return;setSession(data.session);setAuthLoading(false);if(error)setSyncError(error.message)}).catch(()=>{if(alive){setAuthLoading(false);setSyncError('Unable to reach authentication. Please retry signing in.')}})
    const {data:listener}=db.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(next);setAuthLoading(false)}})
    return()=>{alive=false;listener.subscription.unsubscribe()}
  },[db])
  useEffect(()=>{
    if(!db)return
    generation.current++;busy.current=false;clearTimeout(timer.current);owner.current=session?.user.id||'';base.current=null;conflictState.current=null;setConflicts([]);setLoaded(false)
    current.current=emptyWorkspace();setState(current.current)
    if(owner.current){setSync('saving');void pump.current()}
    return()=>{generation.current++;clearTimeout(timer.current);busy.current=false}
  },[db,session?.user.id])
  useEffect(()=>{
    if(!db)return
    const retry=()=>void pump.current()
    const unload=(e:BeforeUnloadEvent)=>{if(base.current&&diffWorkspace(base.current,current.current)){cache();e.preventDefault();e.returnValue=''}}
    const interval=setInterval(retry,30000)
    window.addEventListener('online',retry);window.addEventListener('focus',retry);window.addEventListener('beforeunload',unload)
    return()=>{clearInterval(interval);window.removeEventListener('online',retry);window.removeEventListener('focus',retry);window.removeEventListener('beforeunload',unload)}
  },[db])
  const resolveConflicts=(choices:Record<string,'local'|'remote'>)=>{
    const state=conflictState.current;if(!state)return
    const merged=mergeWorkspaces(state.base,current.current,state.remote,choices)
    if(merged.conflicts.length){setConflicts(merged.conflicts);return}
    current.current=merged.workspace;setState(current.current);base.current=state.remote;revision.current=state.revision;conflictState.current=null;setConflicts([]);cache();setSync('saving');schedule(0)
  }
  return {workspace,setWorkspace,session,authLoading,loaded,sync,syncError,conflicts,resolveConflicts,retrySync:()=>void pump.current()}
}
