import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const setup=async()=>{
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema auth to authenticated,service_role;grant execute on all functions in schema auth to authenticated,service_role;
 create table storage.buckets(id text primary key,public boolean);
 insert into auth.users values('${owner}'),('${other}');`)
 await db.exec(readFileSync('supabase/relational-schema.sql','utf8'))
 await db.exec(readFileSync('supabase/stripe-integration.sql','utf8'))
 await db.exec(readFileSync('supabase/public-client-links.sql','utf8'))
 const migration=readFileSync('supabase/migrations/3.5-reliability.sql','utf8')
 await db.exec(migration);await db.exec(migration)
 return db
}
const auth=async(db,id=owner,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.role','${role}',false);set role ${role};`)
const load=async db=>(await db.query('select agency_load_workspace() as w')).rows[0].w
const patch=async(db,p,rev)=>(await db.query('select agency_apply_patch($1::jsonb,$2) as revision',[JSON.stringify(p),rev])).rows[0].revision
const invoice={id:'invoice1',title:'Site build',category:'invoices',clientId:'',projectId:'',amount:1000,vatRate:25,currency:'DKK',status:'Sent',url:'',dueDate:'',details:'',checklist:[]}
test('migration applies twice; RLS isolates owners; stale edits roll back; Stripe receipt is atomic and protected',async()=>{
 const db=await setup()
 try{
 await auth(db)
 let w=await load(db)
 const rev=await patch(db,{operations:{upsert:[invoice],delete:[]}},w.revision)
 assert.ok(rev>0)
 await assert.rejects(()=>patch(db,{operations:{upsert:[{...invoice,title:'Stale overwrite'}],delete:[]}},0),/STALE_WORKSPACE/)
 assert.equal((await load(db)).operations[0].title,'Site build')
 await auth(db,other);assert.equal((await load(db)).operations.length,0)
 await auth(db,owner,'service_role')
 const payment=(event,amount=125000)=>db.query('select agency_record_stripe_payment($1,$2,$3,$4,$5,$6,$7,$8) as result',[owner,'invoice1',event,'checkout.session.completed','cs_test_paid',amount,'dkk','2026-11-11T10:00:00Z'])
 await assert.rejects(()=>payment('evt_bad',100),/Amount\/currency mismatch/)
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from agency_stripe_events')).rows[0].n,0);await auth(db,owner,'service_role')
 await payment('evt_one');await payment('evt_one');await payment('evt_two')
 await auth(db);w=await load(db)
 assert.equal(w.transactions.length,1);assert.equal(w.transactions[0].amount,1250);assert.equal(w.operations[0].status,'Paid')
 await assert.rejects(()=>patch(db,{transactions:{upsert:[{...w.transactions[0],amount:1}],delete:[]}},w.revision),/verified payment service/)
 await assert.rejects(()=>patch(db,{transactions:{upsert:[],delete:[w.transactions[0].id]}},w.revision),/verified payment service/)
 await assert.rejects(()=>patch(db,{operations:{upsert:[{...w.operations[0],status:'Sent'}],delete:[]}},w.revision),/read-only/)
 await patch(db,{operations:{upsert:[{...w.operations[0],details:'Internal note'}],delete:[]}},w.revision)
 assert.equal((await load(db)).operations[0].details,'Internal note')
 }finally{await db.close()}
})

test('public response transaction rolls back on changed scope, then accepts once and updates onboarding',async()=>{
 const db=await setup()
 try{
 await auth(db);const initial=await load(db)
 const op={...invoice,id:'intake',category:'onboarding',status:'Awaiting client'}
 await patch(db,{operations:{upsert:[op],delete:[]}},initial.revision)
 await db.exec('reset role')
 await db.query("insert into agency_public_links(owner_id,record_id,kind,token_hash,expires_at) values($1,'intake','intake','tokenhash',now()+interval '1 day')",[owner])
 await auth(db,owner,'service_role')
 const response={name:'Test',email:'test@example.test'},receipt={...op,id:'public:receipt',category:'communications',status:'Logged'}
 const submit=expected=>db.query('select agency_submit_public_response($1,$2::jsonb,$3::jsonb,$4::jsonb)',['tokenhash',JSON.stringify(expected),JSON.stringify(response),JSON.stringify(receipt)])
 await assert.rejects(()=>submit({...op,title:'Wrong scope'}),/Record changed/)
 await submit(op)
 await assert.rejects(()=>submit(op),/already used/)
 await auth(db);const saved=await load(db)
 assert.equal(saved.operations.find(x=>x.id==='intake').status,'Received');assert.equal(saved.operations.filter(x=>x.id==='public:receipt').length,1)
 }finally{await db.close()}
})
test('complete setup reruns without changing existing records or private files; Storage policies isolate owner paths',async()=>{
 const db=await setup()
 try{
 await auth(db);await patch(db,{operations:{upsert:[invoice],delete:[]}},0)
 await db.exec(`reset role;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 insert into storage.objects(bucket_id,name) values('agency-documents','${owner}/agreement.pdf'),('agency-documents','${other}/private.pdf');`)
 const complete=readFileSync('supabase/PAID-HUSTLE-ALL-IN-ONE-SETUP.sql','utf8')
 await db.exec(complete);await db.exec(complete)
 assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,2)
 assert.equal((await db.query("select public from storage.buckets where id='agency-documents'")).rows[0].public,false)
 await auth(db);assert.equal((await load(db)).operations[0].title,invoice.title)
 const files=await db.query('select name from storage.objects');assert.equal(files.rows.length,1);assert.equal(files.rows[0].name,`${owner}/agreement.pdf`)
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('agency-documents',$1)",[`${other}/intrusion.pdf`]),/row-level security/)
 }finally{await db.close()}
})
