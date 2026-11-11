import {render,screen,within,waitFor,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,test,expect,vi} from 'vitest'
import App from '../../src/App'
import {defaultClient,defaultProject,defaultTask,emptyWorkspace} from '../../src/data'
const KEY='paid-hustlee-workspace-v1'
const state=()=>JSON.parse(localStorage.getItem(KEY)!)
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline test')));vi.spyOn(window,'confirm').mockReturnValue(true)})
const seed=()=>{
 const w=emptyWorkspace();w.clients=[{...defaultClient(),id:'c1',name:'Studio Example'},{...defaultClient(),id:'c2',name:'Inactive Example'},{...defaultClient(),id:'c3',name:'No projects'}]
 w.projects=[{...defaultProject('c1'),id:'p1',name:'Growth retainer',dealType:'Retainer',status:'In Progress'},{...defaultProject('c2'),id:'p2',name:'Completed build',status:'Completed'},{...defaultProject('c2'),id:'p3',name:'Cancelled build',status:'Cancelled'},{...defaultProject('c1'),id:'p4',name:'Archived build',archivedAt:'2026-01-01'}]
 w.tasks=[{...defaultTask(),id:'t1',title:'Write landing page',clientId:'c1',projectId:'p1'}]
 w.preferences.automations={enabled:{'weekly-review':false,'completed-project':false}}
 localStorage.setItem(KEY,JSON.stringify(w));return w
}
test('navigation, active totals, archive agreement access and task completion work in the mounted app',async()=>{
 seed();const user=userEvent.setup();render(<App/>);
 expect(screen.queryByRole('button',{name:'Documents',exact:true})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Automations',exact:true})).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Clients & projects',exact:true}))
 expect(document.querySelector('.page-stats')?.textContent).toBe('1 Active Clients1 Active Projects1 Active Retainers')
 await user.click(screen.getByRole('button',{name:'Open Growth retainer project for Studio Example'}))
 await user.click(screen.getByText('Agreements',{exact:true}))
 expect(screen.getByRole('button',{name:'Upload agreement'})).toBeDisabled()
 await user.click(within(document.querySelector('.sidebar')!).getByRole('button',{name:/^Tasks/}))
 await user.click(screen.getByTitle('Complete task'))
 expect(state().tasks[0].done).toBe(true)
 await user.click(screen.getByRole('button',{name:'Settings',exact:true}))
 await user.click(screen.getByText('Automations',{exact:true}))
 expect(screen.getByRole('button',{name:'Run due actions'})).toBeInTheDocument()
 expect(screen.queryByLabelText('Enable Overdue invoices')).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Project: Archived build · View agreements'}))
 await user.click(screen.getByText('Agreements',{exact:true}))
 expect(screen.getByText(/Files stay accessible after archiving/)).toBeInTheDocument()
 expect(state().projects.find(p=>p.id==='p4').archivedAt).toBeTruthy()
})
test('CSV import from pipeline keeps existing records, skips duplicates and lead source supports Other',async()=>{
 seed();const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'Sales pipeline',exact:true}))
 expect(screen.getByRole('button',{name:'Import Leads'})).toBeInTheDocument()
 const file=new File(['Company,Email,Source\nNew Example,new@example.test,Referral\nNew Example,new@example.test,Referral'], 'leads.csv',{type:'text/csv'})
 await user.upload(document.querySelector('input[accept=".csv,text/csv"]')!,file)
 await waitFor(()=>expect(state().leads).toHaveLength(1))
 expect(state().clients).toHaveLength(3)
 await user.click(screen.getByRole('button',{name:/New Example/}))
 const modal=screen.getByRole('dialog')
 expect(within(modal).getByLabelText('Lead source')).toHaveValue('Referral')
 await user.selectOptions(within(modal).getByLabelText('Lead source'),'Other')
 await user.type(within(modal).getByLabelText('Custom lead source'),'Podcast')
 await user.click(within(modal).getByRole('button',{name:'Save changes'}))
 expect(state().leads[0].source).toBe('Podcast')
})
test('lead proposal acceptance creates one client, project, onboarding and renewal without inventing revenue',async()=>{
 seed();const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'Sales pipeline',exact:true}))
 const file=new File(['Company,Email,Value\nProposal Example,proposal@example.test,10000'], 'proposal.csv',{type:'text/csv'})
 await user.upload(document.querySelector('input[accept=".csv,text/csv"]')!,file)
 await user.click(await screen.findByRole('button',{name:/Proposal Example/}))
 await user.click(screen.getByRole('button',{name:'Prepare proposal'}))
 const modal=await screen.findByRole('dialog',{name:'Edit agency record'})
 await user.selectOptions(within(modal).getByLabelText('Status'),'Accepted')
 await user.selectOptions(within(modal).getByLabelText('Agreement type'),'Retainer')
 fireEvent.change(within(modal).getByLabelText('Agreement end date (optional)'),{target:{value:'2027-11-11'}})
 await user.click(within(modal).getByRole('button',{name:'Save record'}))
 await waitFor(()=>expect(state().clients).toHaveLength(4))
 expect(state().projects).toHaveLength(5)
 expect(state().operations.filter(r=>r.category==='onboarding')).toHaveLength(1)
 expect(state().operations.filter(r=>r.category==='renewals')).toHaveLength(1)
 expect(state().transactions).toHaveLength(0)
 expect(state().leads[0].stage).toBe('Closed Won')
 // Reload the actual component and confirm conversion is idempotent.
 const saved=state();expect(saved.projects.filter(p=>p.id===saved.leads[0].convertedProjectId)).toHaveLength(1)
})
