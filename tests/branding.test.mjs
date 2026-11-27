import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const read=p=>readFileSync(p,'utf8')
test('browser title, icon and PWA label use Strategy Scale',()=>{
  const html=read('index.html')
  const manifest=JSON.parse(read('public/manifest.webmanifest'))
  assert.match(html,/<title>Strategy Scale<\/title>/)
  for(const file of ['favicon.ico','favicon-32x32.png','apple-touch-icon.png','icon-192.png','icon-512.png']) assert.ok(existsSync('public/'+file),file)
  assert.equal(manifest.name,'Strategy Scale')
  assert.equal(manifest.short_name,'Strategy Scale')
})
test('sidebar uses same artwork as browser/PWA icons',()=>{
  const app=read('src/App.tsx')
  assert.match(app,/Strategy Scale<\/strong><span>AGENCY WORKSPACE/)
  assert.match(app,/strategy-scale-icon\.png/)
  assert.match(app,/aria-label="Strategy Scale"/)
})
test('original agency data and storage keys remain unchanged',()=>{
  assert.match(read('src/data.ts'),/agencyName: 'PAID HUSTLE'/)
  assert.match(read('src/useWorkspace.ts'),/paid-hustlee-workspace-v1/)
})
