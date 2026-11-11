import {useState} from 'react'
import {render,screen,waitFor,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {test,expect,vi} from 'vitest'
import ProjectAgreements from '../../src/ProjectAgreements'
import {emptyWorkspace,defaultProject,defaultClient} from '../../src/data'
test('private agreements upload, signed viewing, download and confirmed removal retain historical metadata',async()=>{
 const user=userEvent.setup(),w=emptyWorkspace();w.clients=[{...defaultClient(),id:'c'}];w.projects=[{...defaultProject('c'),id:'p',archivedAt:'2026-01-01'}]
 const storage={upload:vi.fn().mockResolvedValue({error:null}),createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'https://storage.example.test/file?token=temporary'},error:null}),download:vi.fn().mockResolvedValue({data:new Blob(['contract']),error:null}),remove:vi.fn().mockResolvedValue({error:null})}
 const popup={opener:{},location:{href:''},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as any);vi.spyOn(window,'confirm').mockReturnValue(true)
 URL.createObjectURL=vi.fn().mockReturnValue('blob:test');URL.revokeObjectURL=vi.fn();vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 let current=w
 function Fixture(){const [data,setData]=useState(w);current=data;return <ProjectAgreements projectId="p" data={data} setData={setData} db={{storage:{from:()=>storage}} as any} session={{user:{id:'owner'}} as any}/>}
 render(<Fixture/>);await user.click(screen.getByText('Agreements',{exact:true}))
 await user.upload(document.querySelector('input[type=file]')!,new File(['contract'],'agreement.pdf',{type:'application/pdf'}))
 await waitFor(()=>expect(current.operations).toHaveLength(1));expect(storage.upload.mock.calls[0][0]).toMatch(/^owner\//)
 expect(current.operations[0].projectId).toBe('p')
 await user.click(screen.getByRole('button',{name:'View'}));expect(storage.createSignedUrl).toHaveBeenCalledWith(current.operations[0].filePath,120);expect(popup.location.href).toContain('token=temporary')
 await user.click(screen.getByRole('button',{name:'Download'}));expect(storage.download).toHaveBeenCalledWith(current.operations[0].filePath)
 await user.click(screen.getByTitle('Remove agreement.pdf'));expect(storage.remove).toHaveBeenCalledTimes(1);expect(current.operations).toHaveLength(1);expect(current.operations[0].fileDeletedAt).toBeTruthy()
 expect(current.projects[0].archivedAt).toBe('2026-01-01')
})
test('failed deletion keeps the file reference; invalid files never upload',async()=>{
 const user=userEvent.setup(),w=emptyWorkspace();w.operations=[{id:'doc',category:'documents',title:'old.pdf',projectId:'p',clientId:'c',filePath:'owner/original.pdf',status:'Draft',dueDate:'',amount:null,currency:'DKK',url:'',details:'',checklist:[],createdAt:'',updatedAt:''}]
 const storage={remove:vi.fn().mockResolvedValue({error:{message:'Storage unavailable'}}),upload:vi.fn()};vi.spyOn(window,'confirm').mockReturnValue(true)
 const setter=vi.fn();render(<ProjectAgreements projectId="p" data={w} setData={setter} db={{storage:{from:()=>storage}} as any} session={{user:{id:'owner'}} as any}/>)
 await user.click(screen.getByText('Agreements',{exact:true}));await user.click(screen.getByTitle('Remove old.pdf'));expect(setter).not.toHaveBeenCalled();expect(screen.getByText(/File was not deleted/)).toBeInTheDocument()
 fireEvent.change(document.querySelector('input[type=file]')!,{target:{files:[new File(['<script>'],'bad.html',{type:'text/html'})]}})
 expect(storage.upload).not.toHaveBeenCalled()
})
