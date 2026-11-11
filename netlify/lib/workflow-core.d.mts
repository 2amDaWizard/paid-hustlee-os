import type {Workspace,Task,OperationsRecord} from '../../src/types'
export function monthlyDeadline(original:string,day:string):string
export function planAgencyActions(input:{leads?:Workspace['leads'];projects?:Workspace['projects'];operations?:Workspace['operations'];existingTaskIds?:string[];existingOpsIds?:string[];preferences?:Partial<Workspace['preferences']>},day:string):{tasks:Task[];operations:OperationsRecord[]}
