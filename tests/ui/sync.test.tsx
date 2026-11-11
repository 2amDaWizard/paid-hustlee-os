import {renderHook,act,waitFor} from '@testing-library/react'
import {test,expect,vi} from 'vitest'
import {useWorkspace} from '../../src/useWorkspace'
import {defaultTask,emptyWorkspace} from '../../src/data'
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test'}
const fixture=()=>{
 let cloud={...emptyWorkspace(),revision:0};cloud.tasks=[{...defaultTask(),id:'t1',title:'Original'}]
 let writeFailure=false,loadFailure=false,loseAck=false,hold:Promise<void>|null=null
 const rpc=vi.fn(async(name:string,args:any)=>{
  if(name==='agency_load_workspace'){if(loadFailure)throw new Error('Offline');return {data:structuredClone(cloud),error:null}}
  if(hold)await hold
  if(writeFailure)throw new Error('Offline')
  if(args.p_expected_revision!==cloud.revision)return {data:null,error:{message:'STALE_WORKSPACE'}}
  for(const key of ['tasks','clients','projects','leads','operations','transactions','activityLog'])if(args.p_patch[key]){const delta=args.p_patch[key];cloud[key]=[...cloud[key].filter(r=>!delta.delete.includes(r.id)&&!delta.upsert.some(x=>x.id===r.id)),...structuredClone(delta.upsert)]}
  if(args.p_patch.preferences)cloud.preferences=structuredClone(args.p_patch.preferences)
  cloud.revision++
  if(loseAck){loseAck=false;throw new Error('Response lost')}
  return {data:cloud.revision,error:null}
 })
 const db={rpc,auth:{getSession:async()=>({data:{session:{user}},error:null}),onAuthStateChange:()=>({data:{listener:null,subscription:{unsubscribe(){}}}})}} as any
 return {db,rpc,get cloud(){return cloud},setWriteFailure(v:boolean){writeFailure=v},setLoadFailure(v:boolean){loadFailure=v},setLoseAck(){loseAck=true},setHold(v:Promise<void>|null){hold=v}}
}
const edit=(result:any,title:string)=>act(()=>result.current.setWorkspace(w=>({...w,tasks:w.tasks.map(t=>({...t,title}))})))
test('successful save status waits for server acknowledgement and edits during a write are drained',async()=>{
 const f=fixture(),{result}=renderHook(()=>useWorkspace(f.db,true));await waitFor(()=>expect(result.current.sync).toBe('saved'))
 let release!:()=>void;f.setHold(new Promise<void>(r=>release=r));edit(result,'First edit');expect(result.current.sync).toBe('saving')
 act(()=>result.current.retrySync());await waitFor(()=>expect(f.rpc.mock.calls.some(c=>c[0]==='agency_apply_patch')).toBe(true))
 edit(result,'Second edit');expect(result.current.sync).toBe('saving')
 f.setHold(null);await act(async()=>release());await waitFor(()=>expect(result.current.sync).toBe('saved'))
 expect(f.cloud.tasks[0].title).toBe('Second edit')
})
test('interruption retries preserve draft across remount and lost acknowledgement does not duplicate writes',async()=>{
 const f=fixture();let hook=renderHook(()=>useWorkspace(f.db,true));await waitFor(()=>expect(hook.result.current.loaded).toBe(true))
 f.setWriteFailure(true);edit(hook.result,'Offline edit');act(()=>hook.result.current.retrySync());await waitFor(()=>expect(hook.result.current.sync).toBe('error'))
 expect(sessionStorage.getItem(`paid-hustle-draft-v35:${user.id}`)).toContain('Offline edit')
 hook.unmount();f.setWriteFailure(false);f.setLoseAck();hook=renderHook(()=>useWorkspace(f.db,true))
 await waitFor(()=>expect(hook.result.current.sync).toBe('error'))
 act(()=>hook.result.current.retrySync());await waitFor(()=>expect(hook.result.current.sync).toBe('saved'))
 expect(f.cloud.tasks).toHaveLength(1);expect(f.cloud.tasks[0].title).toBe('Offline edit');expect(f.cloud.revision).toBe(1)
})
test('cloud changes merge with independent local fields; competing edits require an explicit choice',async()=>{
 const f=fixture(),{result}=renderHook(()=>useWorkspace(f.db,true));await waitFor(()=>expect(result.current.sync).toBe('saved'))
 f.cloud.tasks[0].notes='Remote note';f.cloud.revision++;edit(result,'Local title');act(()=>result.current.retrySync())
 await waitFor(()=>expect(result.current.sync).toBe('saved'));expect(f.cloud.tasks[0].notes).toBe('Remote note')
 f.cloud.tasks[0].title='Other tab title';f.cloud.revision++;edit(result,'This tab title');act(()=>result.current.retrySync())
 await waitFor(()=>expect(result.current.sync).toBe('conflict'));expect(f.cloud.tasks[0].title).toBe('Other tab title')
 const choices=Object.fromEntries(result.current.conflicts.map(c=>[c.path,'local']))
 act(()=>result.current.resolveConflicts(choices));await waitFor(()=>expect(result.current.sync).toBe('saved'));expect(f.cloud.tasks[0].title).toBe('This tab title')
})
