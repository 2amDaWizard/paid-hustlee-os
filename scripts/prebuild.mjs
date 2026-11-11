// Helpful explicit error messages when GitHub's web uploader omits nested folders.
import {existsSync,readFileSync} from 'node:fs'
const essential=['index.html','src/main.tsx','src/App.tsx','src/types.ts','src/InsightsPage.tsx','src/agency-intelligence.ts','netlify.toml','supabase/PAID-HUSTLE-ALL-IN-ONE-SETUP.sql']
const missing=essential.filter(file=>!existsSync(file))
if(missing.length){console.error('\nPAID HUSTLE upload is incomplete. Missing:\n'+missing.map(file=>'  - '+file).join('\n')+'\n\nUpload the ENTIRE contents of the extracted ZIP to the GitHub repository root, preserving the src/, supabase/ and netlify/ folders.\n');process.exit(1)}
const html=readFileSync('index.html','utf8')
if(!html.includes('/src/main.tsx')){console.error('index.html must reference /src/main.tsx');process.exit(1)}
console.log('PAID HUSTLE source structure looks complete.')
