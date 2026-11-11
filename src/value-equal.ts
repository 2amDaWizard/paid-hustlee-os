/** JSONB reorders object keys; equality must not turn that into edits or conflicts. */
export function valueEqual(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>valueEqual(v,b[i]))
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>
 const keys=[...new Set([...Object.keys(left),...Object.keys(right)])]
 return keys.every(k=>valueEqual(left[k],right[k]))
}
