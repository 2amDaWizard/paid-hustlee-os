import {valueEqual} from './value-equal.ts'
/** Preserve fields changed elsewhere while a form is open. Never silently overwrite a competing edit. */
export function mergeEditedRecord<T extends {id:string}>(original:T,edited:T,current:T):T{
 const result={...current}
 for(const key of Object.keys(edited) as (keyof T)[]){
  if(valueEqual(edited[key],original[key]))continue
  if(!valueEqual(current[key],original[key])&&!valueEqual(current[key],edited[key]))throw new Error(`The ${String(key)} field changed elsewhere while this form was open. Your draft is still here; copy it before reopening the current record.`)
  result[key]=edited[key]
 }
 return result
}
