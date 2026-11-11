import { useEffect,useRef,useState } from 'react'
import type { Dispatch,SetStateAction,ChangeEvent } from 'react'
import type { SupabaseClient,Session } from '@supabase/supabase-js'
import type { Workspace,OperationsRecord } from './types'
import { uid,today } from './data'
import { Download,FileLock2,Trash2,Upload } from 'lucide-react'

const BUCKET='agency-documents'
const MAX_SIZE=10*1024*1024
const MIME=new Set(['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
const extension=(name:string)=>name.toLowerCase().split('.').pop()||''
export default function ProjectAgreements({data,setData,db,session,projectId}: {projectId?:string;data:Workspace;setData:Dispatch<SetStateAction<Workspace>>;db:SupabaseClient|null;session:Session|null}) {
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const fileInput=useRef<HTMLInputElement>(null)
  const clientId=(data.projects||[]).find(p=>p.id===projectId)?.clientId||''
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const docs=(data.operations||[]).filter(op=>op.category==='documents'&&(projectId?op.projectId===projectId:!op.projectId||!(data.projects||[]).some(p=>p.id===op.projectId))&&!op.fileDeletedAt)
  const upload=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    if(!db||!session){setMessage('Private uploads require signing in to your test Supabase project.');return}
    if(file.size===0||file.size>MAX_SIZE){setMessage('Select a non-empty file of 10 MB or less.');return}
    if(!MIME.has(file.type)){setMessage('Allowed types: PDF, PNG, JPEG, WebP, TXT, CSV, DOCX, XLSX.');return}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||`document.${extension(file.name)}`
    const path=`${session.user.id}/${uid()}-${safeName}`
    setBusy(true)
    try{
      const {error}=await db.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type})
      if(error)throw error
      if(!mounted.current){await db.storage.from(BUCKET).remove([path]);return}
      const record:OperationsRecord={id:uid(),category:'documents',title:file.name,clientId,projectId:projectId||'',status:'Draft',dueDate:'',amount:null,currency:data.preferences.currency||'DKK',url:'',filePath:path,fileMime:file.type,fileSize:file.size,details:'Private file in owner-scoped Supabase Storage. Never share raw storage paths.',checklist:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
      setData(prev=>({...prev,operations:[record,...(prev.operations||[])],activityLog:[{id:uid(),date:new Date().toISOString(),label:`Private file uploaded: ${file.name}`},...(prev.activityLog||[])].slice(0,250)}))
      setMessage('File uploaded. Confirm the cloud save completes before closing the app.')
    }catch(e){setMessage(e instanceof Error?e.message:'Upload failed. Check storage SQL policies and configuration.')}
    finally{setBusy(false)}
  }
  const open=async(item:OperationsRecord,download=false)=>{
    if(!db||!session||!item.filePath){setMessage('No private storage file is attached.');return}
    if(!item.filePath.startsWith(`${session.user.id}/`)){setMessage('This file does not belong to your account.');return}
    setBusy(true)
    const popup=download?null:window.open('about:blank','_blank')
    if(popup)popup.opener=null
    try{
      if(download){
        const {data:blob,error}=await db.storage.from(BUCKET).download(item.filePath)
        if(error||!blob)throw error||new Error('Unable to download agreement')
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=item.title;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
      }else{
        const {data:result,error}=await db.storage.from(BUCKET).createSignedUrl(item.filePath,120)
        if(error||!result?.signedUrl)throw error||new Error('Unable to open agreement')
        if(popup)popup.location.href=result.signedUrl
        else setMessage('Allow pop-ups to view this agreement, or use Download.')
      }
    }catch(e){popup?.close();setMessage(e instanceof Error?e.message:'Unable to access agreement')}
    finally{setBusy(false)}
  }
  const remove=async(item:OperationsRecord)=>{
    if(!confirm(`Permanently delete private file “${item.title}”? Download a copy first if needed.`))return
    setBusy(true)
    try{
      if(item.filePath){
        if(!db||!session||!item.filePath.startsWith(`${session.user.id}/`))throw new Error('Cannot remove this file: owner check failed.')
        const {error}=await db.storage.from(BUCKET).remove([item.filePath]);if(error)throw new Error(error.message)
      }
      if(!mounted.current)return
      setData(prev=>({...prev,operations:(prev.operations||[]).map(r=>r.id===item.id?{...r,fileDeletedAt:new Date().toISOString(),status:'Archived'}:r)}))
      setMessage('File removed from private storage. Record update is queued for cloud saving.')
    }catch(e){setMessage(`File was not deleted: ${e instanceof Error?e.message:'Storage unavailable'}`)}
    finally{setBusy(false)}
  }

  return <details className="panel project-agreements"><summary><FileLock2 size={17}/><strong>{projectId?'Agreements':'Existing unassigned files'}</strong><span>{docs.length}</span></summary><div className="agreements-body"><p className="setting-hint">{projectId?'Contracts and important agreements for this project. Files stay accessible after archiving.':'Previously uploaded files without a project. No files were removed.'}</p>
    {projectId&&<><input ref={fileInput} type="file" style={{display:'none'}} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" onChange={event=>void upload(event)}/><button className="btn btn-subtle btn-sm" disabled={!db||!session||busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/>Upload agreement</button><span className="setting-hint"> Private · Up to 10 MB</span>{(!db||!session)&&<p className="setting-hint">Sign in to your connected workspace to upload and access private files.</p>}</>}
    {message&&<p role="status">{message}</p>}
    {docs.map(item=><div className="agreement-row" key={item.id}><div><strong>{item.title}</strong><small>{item.filePath?`${Math.ceil((item.fileSize||0)/1024)} KB · Private`:'External reference'}</small></div><div className="agreement-actions">{item.filePath?<><button disabled={busy} className="btn btn-subtle btn-sm" onClick={()=>void open(item)}>View</button><button disabled={busy} className="btn btn-subtle btn-sm" onClick={()=>void open(item,true)}><Download size={14}/>Download</button></>:item.url&&/^https?:\/\//.test(item.url)?<a className="btn btn-subtle btn-sm" href={item.url} rel="noopener noreferrer" target="_blank">Open link</a>:null}<button className="icon-button" title={`Remove ${item.title}`} disabled={busy} onClick={()=>void remove(item)}><Trash2 size={15}/></button></div></div>)}
    {!docs.length&&<p className="setting-hint">No agreements attached.</p>}
  </div></details>
}
