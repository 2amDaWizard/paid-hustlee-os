import {mergeEditedRecord} from './edit-record'
import { useState,useRef } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { Client, Project } from './types'
import { clientStatuses, priorities, dealTypes, currencies, services } from './types'

interface Props {
  project: Project; clients: Client[]; isNew: boolean; stageOptions?: string[]
  onClose:()=>void; onSave:(project:Project)=>void; onDelete:(id:string)=>void
}
export default function ProjectEditor({project,clients,isNew,onClose,onSave,onDelete,stageOptions=clientStatuses}: Props) {
  const [form,setForm]=useState(project)
  const original=useRef(project)
  const [error,setError]=useState('')
  const [moreServices,setMoreServices]=useState(false)
  const [custom,setCustom]=useState('')
  const update=<K extends keyof Project>(key:K,value:Project[K])=>setForm(v=>({...v,[key]:value}))
  const submit=(e:FormEvent)=>{e.preventDefault();if(!form.name.trim()){setError('Project name is required');return}if(!form.clientId){setError('Choose a client');return}try{onSave(mergeEditedRecord(original.current,{...form,name:form.name.trim()},project))}catch(e){setError(e instanceof Error?e.message:'Unable to apply changes')}}
  const field=(name:string,key:keyof Project,type='text',placeholder='')=><label className="field"><span>{name}</span><input type={type} value={String(form[key]??'')} placeholder={placeholder} onChange={e=>update(key,e.target.value as never)}/></label>
  const select=<K extends keyof Project>(name:string,key:K,options:string[])=><label className="field"><span>{name}</span><select value={String(form[key]??'')} onChange={e=>update(key,e.target.value as Project[K])}>{options.map(item=><option key={item}>{item}</option>)}</select></label>
  const chooseService=(s:string)=>update('services',form.services.includes(s)?form.services.filter(item=>item!==s):[...form.services,s])
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-label={isNew?'Create project':'Edit project'}><header className="modal-head"><div><span className="eyebrow">CLIENT DELIVERY / PROJECT</span><h2>{isNew?'Launch a project':'Project details'}</h2><p className="editor-caption">The workspace itself holds tasks, notes, assets, and activity.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></header>
    <form onSubmit={submit}><div className="modal-body">
      <div className="field-grid">{field('Project name *','name','text','e.g. Meta Ads · November')}
      <label className="field"><span>Client *</span><select value={form.clientId} onChange={e=>update('clientId',e.target.value)}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
      <div className="field-grid">{select('Delivery stage','status',stageOptions)}{select('Priority','priority',priorities)}</div>
      <div className="separator-label">SERVICES IN SCOPE</div><div className="service-picker">{services.map(s=><button type="button" className={form.services.includes(s)?'selected':''} key={s} onClick={()=>chooseService(s)}>{form.services.includes(s)&&<Check size={13}/>} {s}</button>)}{form.services.filter(s=>!services.includes(s)).map(s=><button type="button" className="selected" key={s} onClick={()=>chooseService(s)}><Check size={13}/>{s}</button>)}</div>
      {!moreServices?<button type="button" className="field-link" onClick={()=>setMoreServices(true)}><Plus size={14}/>Add custom service</button>:<div className="hub-inline-add"><input aria-label="Custom service" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Custom service"/><button type="button" className="btn btn-sm btn-subtle" onClick={()=>{if(custom.trim()&&!form.services.includes(custom.trim()))update('services',[...form.services,custom.trim()]);setCustom('');setMoreServices(false)}}>Add</button></div>}
      <div className="separator-label">DEAL DETAILS</div><div className="field-grid">{select('Deal type','dealType',dealTypes)}{select('Original deal currency','currency',currencies)}</div>
      <div className="field-grid"><label className="field"><span>{form.dealType==='Retainer'?'Monthly retainer':form.dealType==='Revenue Share'?'Estimated earnings':'Deal value'} ({form.currency})</span><input type="number" min="0" step="0.01" value={form.dealValue??''} placeholder="Not set" onChange={e=>update('dealValue',e.target.value===''?null:Number(e.target.value))}/></label>{form.dealType==='Revenue Share'&&<label className="field"><span>Revenue share percentage</span><input type="number" min="0" max="100" step="0.1" value={form.revenueSharePercent??''} onChange={e=>update('revenueSharePercent',e.target.value===''?null:Number(e.target.value))}/></label>}</div>
      <div className="separator-label">TIMELINE & FOLLOW-UP</div><div className="field-grid">{field('Start date','startDate','date')}{field('Deadline','deadline','date')}</div>
      {field('Next action','nextAction','text','What should happen next?')}<div className="field-grid">{field('Next follow-up','nextFollowUp','date')}</div>
      <label className="field"><span>Project description</span><textarea rows={3} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="What is the outcome of this project?"/></label>
      {error&&<div className="inline-error">{error}</div>}
    </div><footer className="modal-footer">{!isNew&&<button type="button" className="btn btn-danger" onClick={()=>onDelete(project.id)}><Trash2 size={15}/>Archive project</button>}<span className="flex-grow"/><button type="button" className="btn btn-subtle" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={15}/>{isNew?'Create project':'Save details'}</button></footer></form>
  </div></div>
}
