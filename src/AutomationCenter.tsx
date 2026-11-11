import { useMemo,useState } from 'react'
import type { Dispatch,SetStateAction } from 'react'
import type { Workspace,AutomationKind } from './types'
import { applyAutomations,AUTOMATION_KINDS } from './automation-engine'
import { today } from './data'
import { Check,Play,Workflow } from 'lucide-react'

export default function AutomationCenter({data,setData}: {data:Workspace;setData:Dispatch<SetStateAction<Workspace>>}) {
  const [message,setMessage]=useState('')
  const preview=useMemo(()=>applyAutomations(data,today()),[data])
  const processed=data.preferences.automations?.processed?.length||0
  const toggle=(kind:AutomationKind,enabled:boolean)=>setData(prev=>({...prev,preferences:{...prev.preferences,automations:{...prev.preferences.automations,enabled:{...prev.preferences.automations?.enabled,[kind]:enabled}}}}))
  const run=()=>{
    const count=preview.descriptions.length
    if(!count){setMessage('Everything is up to date. No new workflow actions due.');return}
    setData(prev=>applyAutomations(prev,today()).workspace)
    setMessage(`Created ${count} new item${count===1?'':'s'}. Review the new tasks and operations records.`)
  }
  return <div className="content-page"><div className="page-heading"><div><div className="eyebrow">WORKFLOW CONTROL</div><h2>Automation settings</h2><p>Due rules run automatically when your workspace is open. An optional Netlify server job can also run them daily while the browser is closed. No messages are sent to clients automatically.</p></div></div>
    <section className="panel" style={{padding:24,marginBottom:20}}><div className="settings-icon"><Workflow size={20}/></div><h2>Run safe workflows</h2><p>{preview.descriptions.length} new action(s) ready. {processed} action keys previously processed.</p><button className="btn btn-primary" onClick={run}><Play size={16}/>Run due actions</button>{message&&<p role="status" style={{marginTop:12}}>{message}</p>}{preview.descriptions.length>0&&<div style={{marginTop:18}}><strong>Preview</strong><ul>{preview.descriptions.slice(0,18).map((label,index)=><li key={index}>{label}</li>)}{preview.descriptions.length>18&&<li>And {preview.descriptions.length-18} more</li>}</ul></div>}</section>
    <section className="panel" style={{padding:24}}><h2>Active rules</h2><p>Switch off any workflow you don't want. Records are only generated once per trigger key.</p>{AUTOMATION_KINDS.map(item=><div key={item.id} className="setting-row"><div style={{maxWidth:620}}><strong>{item.title}</strong><p className="setting-hint">{item.description}</p></div><label><input type="checkbox" aria-label={`Enable ${item.title}`} checked={data.preferences.automations?.enabled?.[item.id]!==false} onChange={e=>toggle(item.id,e.target.checked)}/>{data.preferences.automations?.enabled?.[item.id]!==false?<Check size={16}/>:null}</label></div>)}</section>
    <p style={{marginTop:16}} className="setting-hint">Rules run on login and on workspace changes; Run is an optional manual retry. Daily server automation requires Netlify server configuration. Stripe owns invoice reminders and payment confirmations; the CRM does not generate collection tasks.</p>
  </div>
}
