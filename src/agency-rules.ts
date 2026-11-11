import type {Workspace,Project} from './types'
const inactive=new Set(['completed','cancelled','canceled','inactive','archived','ended','closed','on hold','paused'])
export const isActiveProject=(p:Project)=>!p.archivedAt&&!inactive.has(p.status.trim().toLowerCase())
export function activeStatistics(w:Workspace){
  const clients=new Set(w.clients.filter(c=>!c.archivedAt&&!['cancelled','canceled','inactive','archived'].includes(c.status.trim().toLowerCase())).map(c=>c.id))
  const projects=(w.projects||[]).filter(p=>isActiveProject(p)&&clients.has(p.clientId))
  return {clients:new Set(projects.map(p=>p.clientId)).size,projects:projects.length,retainers:projects.filter(p=>p.dealType==='Retainer'||p.status==='Active Retainer').length}
}
export const LEAD_SOURCES=['Cold Outreach','Referral','Google Maps','Instagram','Website','Inbound']
export function monthlyDeadline(original:string,day:string){
  const [y,m]=day.split('-').map(Number)
  const last=new Date(Date.UTC(y,m,0)).getUTCDate()
  const wanted=/^\d{4}-\d{2}-\d{2}$/.test(original)?Number(original.slice(8,10)):last
  return `${day.slice(0,7)}-${String(Math.min(Math.max(wanted,1),last)).padStart(2,'0')}`
}
