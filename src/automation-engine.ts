import {planAgencyActions} from '../netlify/lib/workflow-core.mjs'
import type { Workspace, Task, OperationsRecord, AutomationKind } from './types'

export const AUTOMATION_KINDS: {id:AutomationKind;title:string;description:string}[] = [
  {id:'due-lead',title:'Lead follow-ups',description:'Create a task when a live lead reaches its follow-up date.'},
  {id:'due-project',title:'Project follow-ups',description:'Create a task when an active project reaches its follow-up date.'},
  {id:'contract-renewal',title:'Contract renewals',description:'Create a renewal task within 30 days of an agreement end date.'},
  {id:'monthly-retainer',title:'Monthly retainer cycles',description:'Generate each retainer checklist once per calendar month.'},
  {id:'completed-project',title:'Project handovers',description:'Create a handover record for newly completed projects.'},
  {id:'weekly-review',title:'Weekly review',description:'Prepare a review checklist on Mondays.'}
]
export interface AutomationOutcome {workspace:Workspace;descriptions:string[]}
export function applyAutomations(workspace:Workspace,now:string):AutomationOutcome{
 const result=planAgencyActions({...workspace,existingTaskIds:workspace.tasks.map(t=>t.id),existingOpsIds:(workspace.operations||[]).map(r=>r.id)},now)
 const descriptions=[...result.tasks.map(t=>t.title),...result.operations.map(r=>r.title)]
 if(!descriptions.length)return {workspace,descriptions}
 const processed=[...new Set([...(workspace.preferences.automations?.processed||[]),...[...result.tasks,...result.operations].map(r=>r.id.replace(/^auto:/,''))])]
 return {workspace:{...workspace,tasks:[...result.tasks,...workspace.tasks],operations:[...result.operations,...(workspace.operations||[])],preferences:{...workspace.preferences,automations:{...workspace.preferences.automations,processed}}},descriptions}
}
