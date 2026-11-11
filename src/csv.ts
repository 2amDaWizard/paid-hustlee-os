/** RFC 4180-style CSV parsing with quoted commas, multiline fields and escaped quotes. */
export function parseCsv(text:string):string[][] {
  const lines:string[][]=[];let row:string[]=[],field='',quoted=false
  const src=text.replace(/^\uFEFF/,'')
  for(let i=0;i<src.length;i++){
    const ch=src[i]
    if(ch==='"'){if(quoted&&src[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(ch===','&&!quoted){row.push(field);field=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(field);if(row.some(c=>c.trim()))lines.push(row);row=[];field=''}
    else field+=ch
  }
  if(quoted)throw new Error('The CSV contains an unclosed quotation mark.')
  row.push(field);if(row.some(c=>c.trim()))lines.push(row)
  return lines
}
/** Escape CSV cells; prefix potentially executable spreadsheet formulas. */
export function encodeCsv(rows:(string|number|boolean|null|undefined)[][]):string {
  return rows.map(row=>row.map(cell=>{
    const raw=String(cell??'')
    const safe=/^[\s]*[=+\-@\t\r]/.test(raw)?`'${raw}`:raw
    return `"${safe.replace(/"/g,'""')}"`
  }).join(',')).join('\r\n')+'\r\n'
}
