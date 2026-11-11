-- PAID HUSTLE OS v3.5 - ONE-FILE DATABASE SETUP
-- Paste the ENTIRE file into the Supabase SQL editor of the intended project.
-- Additive: this script NEVER drops the older public.workspaces table.
-- Requires the Supabase built-in auth and storage schemas.


-- ===== relational-schema.sql =====

-- PAID HUSTLE OS relational schema (new, empty workspaces)
-- Run in the Supabase SQL editor before deploying the new app.
-- The former public.workspaces table is left untouched for rollback.
-- Every table is private to the signed-in owner through RLS.

create table if not exists public.agency_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"currency":"DKK","agencyName":"PAID HUSTLE"}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_clients (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null default '',
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  constraint agency_clients_id_nonempty check (length(id)>0),
  constraint agency_clients_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_leads (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  company text not null default '',
  stage text not null default 'Lead',
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  constraint agency_leads_id_nonempty check (length(id)>0),
  constraint agency_leads_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  client_id text,
  name text not null default '',
  status text not null default 'Onboarding',
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,client_id) references public.agency_clients(owner_id,id) on delete set null (client_id),
  constraint agency_projects_id_nonempty check (length(id)>0),
  constraint agency_projects_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_tasks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  client_id text,
  project_id text,
  title text not null default '',
  due_date date,
  done boolean not null default false,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,client_id) references public.agency_clients(owner_id,id) on delete set null (client_id),
  foreign key(owner_id,project_id) references public.agency_projects(owner_id,id) on delete set null (project_id),
  constraint agency_tasks_id_nonempty check (length(id)>0),
  constraint agency_tasks_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_transactions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  client_id text,
  project_id text,
  amount numeric(16,2) not null default 0,
  kind text not null default 'Income' check(kind in ('Income','Expense')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,client_id) references public.agency_clients(owner_id,id) on delete set null (client_id),
  foreign key(owner_id,project_id) references public.agency_projects(owner_id,id) on delete set null (project_id),
  constraint agency_transactions_id_nonempty check (length(id)>0),
  constraint agency_transactions_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  client_id text,
  project_id text,
  category text not null,
  title text not null default '',
  due_date date,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,client_id) references public.agency_clients(owner_id,id) on delete set null (client_id),
  foreign key(owner_id,project_id) references public.agency_projects(owner_id,id) on delete set null (project_id),
  constraint agency_operations_id_nonempty check (length(id)>0),
  constraint agency_operations_payload_id check (payload->>'id' = id)
);

create table if not exists public.agency_activity (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  event_date text not null default '',
  payload jsonb not null,
  primary key(owner_id,id),
  constraint agency_activity_id_nonempty check (length(id)>0),
  constraint agency_activity_payload_id check (payload->>'id' = id)
);

-- Explicit grants are required because all functions run with the owner's rights.
grant select, insert, update, delete on public.agency_preferences, public.agency_clients,
  public.agency_projects, public.agency_leads, public.agency_tasks,
  public.agency_transactions, public.agency_operations, public.agency_activity to authenticated;
revoke all on public.agency_preferences, public.agency_clients, public.agency_projects,
  public.agency_leads, public.agency_tasks, public.agency_transactions,
  public.agency_operations, public.agency_activity from anon;

create index if not exists agency_projects_owner_client on public.agency_projects(owner_id,client_id);
create index if not exists agency_tasks_owner_project on public.agency_tasks(owner_id,project_id);
create index if not exists agency_tasks_owner_due on public.agency_tasks(owner_id,due_date) where not done;
create index if not exists agency_transactions_owner_project on public.agency_transactions(owner_id,project_id);
create index if not exists agency_operations_owner_client on public.agency_operations(owner_id,client_id);
create index if not exists agency_operations_owner_due on public.agency_operations(owner_id,due_date);

-- Enforce tenant boundaries for each relation. No access for anonymous visitors.
do $$
declare tbl text;
begin
  foreach tbl in array array['agency_preferences','agency_clients','agency_leads','agency_projects','agency_tasks','agency_transactions','agency_operations','agency_activity'] loop
    execute format('alter table public.%I enable row level security',tbl);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='owner_records') then
      execute format('create policy owner_records on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',tbl);
    end if;
  end loop;
end $$;

-- Fetches a consistent database snapshot in one SQL statement.
create or replace function public.agency_load_workspace()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'version', 1,
    'revision', coalesce((select revision from agency_preferences where owner_id=auth.uid()),0),
    'preferences', coalesce((select preferences from agency_preferences where owner_id=auth.uid()),'{"currency":"DKK","agencyName":"PAID HUSTLE"}'::jsonb),
    'clients', coalesce((select jsonb_agg(payload order by id) from agency_clients where owner_id=auth.uid()),'[]'::jsonb),
    'projects', coalesce((select jsonb_agg(payload order by id) from agency_projects where owner_id=auth.uid()),'[]'::jsonb),
    'leads', coalesce((select jsonb_agg(payload order by id) from agency_leads where owner_id=auth.uid()),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(payload order by id) from agency_tasks where owner_id=auth.uid()),'[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(payload order by id) from agency_transactions where owner_id=auth.uid()),'[]'::jsonb),
    'operations', coalesce((select jsonb_agg(payload order by id) from agency_operations where owner_id=auth.uid()),'[]'::jsonb),
    'activityLog', coalesce((select jsonb_agg(payload order by id) from agency_activity where owner_id=auth.uid()),'[]'::jsonb)
  );
$$;
revoke all on function public.agency_load_workspace() from public, anon;
grant execute on function public.agency_load_workspace() to authenticated;

-- Applies all changed records in ONE database transaction. Optimistic revision check
-- stops stale tabs from silently replacing someone else's more recent edits.
-- Upserts are ordered parents-first; deletions children-first. No full-workspace overwrite.
create or replace function public.agency_apply_patch(p_patch jsonb, p_expected_revision bigint)
returns bigint language plpgsql security invoker set search_path = public as $$
declare
  oid uuid := auth.uid();
  previous_revision bigint;
  next_revision bigint;
begin
  if oid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  insert into agency_preferences(owner_id) values(oid) on conflict(owner_id) do nothing;
  select revision into previous_revision from agency_preferences where owner_id=oid for update;
  if previous_revision <> p_expected_revision then
    raise exception 'STALE_WORKSPACE: reload to reconcile edits (expected %, actual %)',p_expected_revision,previous_revision using errcode = 'P0001';
  end if;

  insert into agency_clients(owner_id,id,name,payload)
  select oid, obj->>'id', coalesce(obj->>'name',''), obj
  from jsonb_array_elements(coalesce(p_patch->'clients'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set name=excluded.name,payload=excluded.payload,updated_at=now();

  insert into agency_projects(owner_id,id,client_id,name,status,payload)
  select oid,obj->>'id',nullif(obj->>'clientId',''),coalesce(obj->>'name',''),coalesce(obj->>'status','Onboarding'),obj
  from jsonb_array_elements(coalesce(p_patch->'projects'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set client_id=excluded.client_id,name=excluded.name,status=excluded.status,payload=excluded.payload,updated_at=now();

  insert into agency_leads(owner_id,id,company,stage,payload)
  select oid,obj->>'id',coalesce(obj->>'company',''),coalesce(obj->>'stage','Lead'),obj
  from jsonb_array_elements(coalesce(p_patch->'leads'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set company=excluded.company,stage=excluded.stage,payload=excluded.payload,updated_at=now();

  insert into agency_tasks(owner_id,id,client_id,project_id,title,due_date,done,payload)
  select oid,obj->>'id',nullif(obj->>'clientId',''),nullif(obj->>'projectId',''),coalesce(obj->>'title',''),nullif(obj->>'dueDate','')::date,coalesce((obj->>'done')::boolean,false),obj
  from jsonb_array_elements(coalesce(p_patch->'tasks'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set client_id=excluded.client_id,project_id=excluded.project_id,title=excluded.title,due_date=excluded.due_date,done=excluded.done,payload=excluded.payload,updated_at=now();

  insert into agency_transactions(owner_id,id,client_id,project_id,amount,kind,payload)
  select oid,obj->>'id',nullif(obj->>'clientId',''),nullif(obj->>'projectId',''),coalesce((obj->>'amount')::numeric,0),coalesce(obj->>'kind','Income'),obj
  from jsonb_array_elements(coalesce(p_patch->'transactions'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set client_id=excluded.client_id,project_id=excluded.project_id,amount=excluded.amount,kind=excluded.kind,payload=excluded.payload,updated_at=now();

  insert into agency_operations(owner_id,id,client_id,project_id,category,title,due_date,payload)
  select oid,obj->>'id',nullif(obj->>'clientId',''),nullif(obj->>'projectId',''),coalesce(obj->>'category',''),coalesce(obj->>'title',''),nullif(obj->>'dueDate','')::date,obj
  from jsonb_array_elements(coalesce(p_patch->'operations'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set client_id=excluded.client_id,project_id=excluded.project_id,category=excluded.category,title=excluded.title,due_date=excluded.due_date,payload=excluded.payload,updated_at=now();

  insert into agency_activity(owner_id,id,event_date,payload)
  select oid,obj->>'id',coalesce(obj->>'date',''),obj
  from jsonb_array_elements(coalesce(p_patch->'activityLog'->'upsert','[]'::jsonb)) obj
  on conflict(owner_id,id) do update set event_date=excluded.event_date,payload=excluded.payload;

  delete from agency_activity where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'activityLog'->'delete','[]'::jsonb)));
  delete from agency_operations where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'operations'->'delete','[]'::jsonb)));
  delete from agency_transactions where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'transactions'->'delete','[]'::jsonb)));
  delete from agency_tasks where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'tasks'->'delete','[]'::jsonb)));
  delete from agency_projects where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'projects'->'delete','[]'::jsonb)));
  delete from agency_leads where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'leads'->'delete','[]'::jsonb)));
  delete from agency_clients where owner_id=oid and id in (select jsonb_array_elements_text(coalesce(p_patch->'clients'->'delete','[]'::jsonb)));

  update agency_preferences set
    preferences=coalesce(p_patch->'preferences',preferences),
    revision=revision+1,
    updated_at=now()
  where owner_id=oid returning revision into next_revision;
  return next_revision;
end;
$$;
revoke all on function public.agency_apply_patch(jsonb,bigint) from public, anon;
grant execute on function public.agency_apply_patch(jsonb,bigint) to authenticated;


-- ===== public-client-links.sql =====

-- Optional client link intake, booking requests, and approvals.
-- Apply in the TEST project and configure server-side secrets in Netlify.
-- Tokens are SHA-256 hashed at rest; raw tokens are returned only at creation.
create table if not exists public.agency_public_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  kind text not null check(kind in ('intake','booking','approval')),
  token_hash text not null unique,
  review_hash text, -- hash of the exact record revision presented for approval
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.agency_public_links add column if not exists review_hash text;
create index if not exists agency_public_links_owner on public.agency_public_links(owner_id);
alter table public.agency_public_links enable row level security;
-- The server-only service role creates/reads links, never the public API directly.
revoke all on public.agency_public_links from anon,authenticated;

create table if not exists public.agency_public_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  link_id uuid not null references public.agency_public_links(id) on delete cascade,
  kind text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
create index if not exists agency_public_submissions_owner on public.agency_public_submissions(owner_id);
alter table public.agency_public_submissions enable row level security;
revoke all on public.agency_public_submissions from anon;
grant select on public.agency_public_submissions to authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='agency_public_submissions' and policyname='agency_submissions_owner') then
  create policy agency_submissions_owner on public.agency_public_submissions for select to authenticated using(owner_id=auth.uid());
 end if;
end $$;

-- Service-only optimistic revision bump for externally submitted records.
-- Keeping it here means public links do not require Stripe SQL.
create or replace function public.agency_external_touch(p_owner uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare next_revision bigint;
begin
 insert into public.agency_preferences(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 update public.agency_preferences set revision=revision+1,updated_at=now()
 where owner_id=p_owner returning revision into next_revision;
 return next_revision;
end $$;
revoke all on function public.agency_external_touch(uuid) from public,anon,authenticated;
grant execute on function public.agency_external_touch(uuid) to service_role;


-- ===== stripe-integration.sql =====

-- Optional Stripe webhook event log + external write revision touch.
-- Only the Netlify server with service-role credentials may write this table.
create table if not exists public.agency_stripe_events (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);
create index if not exists agency_stripe_events_owner on public.agency_stripe_events(owner_id);
alter table public.agency_stripe_events enable row level security;
revoke all on public.agency_stripe_events from anon,authenticated;

create or replace function public.agency_external_touch(p_owner uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare new_revision bigint;
begin
  insert into public.agency_preferences(owner_id) values(p_owner) on conflict(owner_id) do nothing;
  update public.agency_preferences set revision=revision+1,updated_at=now()
  where owner_id=p_owner returning revision into new_revision;
  return new_revision;
end;
$$;
revoke all on function public.agency_external_touch(uuid) from public,anon,authenticated;
grant execute on function public.agency_external_touch(uuid) to service_role;


-- ===== private-document-storage.sql =====

-- Optional private owner-scoped document bucket.
-- Run only in the PAID-HUSTLE-TEST Supabase project until validated.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('agency-documents','agency-documents',false,10485760,
 array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- All operations are restricted to paths prefixed with the authenticated user's UUID.
-- No anonymous upload, access, listing, or deletion is granted.
do $$
begin
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_read') then
   create policy agency_docs_owner_read on storage.objects for select to authenticated
     using (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_insert') then
   create policy agency_docs_owner_insert on storage.objects for insert to authenticated
     with check (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_delete') then
   create policy agency_docs_owner_delete on storage.objects for delete to authenticated
     using (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
end $$;


-- ===== optional-scheduled-backups.sql =====

-- OPTIONAL: protected nightly backups, after relational-schema.sql is applied.
-- Requires Netlify server-only SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.
-- Never put the service role key in any VITE_ variable.
create table if not exists public.agency_backups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  backup_day date not null default (now() at time zone 'UTC')::date,
  snapshot jsonb not null,
  captured_at timestamptz not null default now(),
  unique(owner_id,backup_day)
);
create index if not exists agency_backups_owner_date on public.agency_backups(owner_id,backup_day desc);
alter table public.agency_backups enable row level security;
revoke all on public.agency_backups from anon,authenticated;
grant select on public.agency_backups to authenticated;
-- Owners can view/download their own backups; only the server backup job may write.
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agency_backups' and policyname='owner_read_backups') then
    create policy owner_read_backups on public.agency_backups for select to authenticated
      using(owner_id = (select auth.uid()));
  end if;
end $$;

create or replace function public.agency_backup_all()
returns integer language plpgsql security definer set search_path=public as $$
declare
  owner_row record;
  saved_count integer:=0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role only' using errcode='42501';
  end if;
  for owner_row in select owner_id from agency_preferences loop
    insert into agency_backups(owner_id,backup_day,snapshot,captured_at)
    values(owner_row.owner_id,(now() at time zone 'UTC')::date,
      jsonb_build_object(
        'version',1,
        'preferences',(select preferences from agency_preferences where owner_id=owner_row.owner_id),
        'clients',coalesce((select jsonb_agg(payload order by id) from agency_clients where owner_id=owner_row.owner_id),'[]'::jsonb),
        'projects',coalesce((select jsonb_agg(payload order by id) from agency_projects where owner_id=owner_row.owner_id),'[]'::jsonb),
        'leads',coalesce((select jsonb_agg(payload order by id) from agency_leads where owner_id=owner_row.owner_id),'[]'::jsonb),
        'tasks',coalesce((select jsonb_agg(payload order by id) from agency_tasks where owner_id=owner_row.owner_id),'[]'::jsonb),
        'transactions',coalesce((select jsonb_agg(payload order by id) from agency_transactions where owner_id=owner_row.owner_id),'[]'::jsonb),
        'operations',coalesce((select jsonb_agg(payload order by id) from agency_operations where owner_id=owner_row.owner_id),'[]'::jsonb),
        'activityLog',coalesce((select jsonb_agg(payload order by id) from agency_activity where owner_id=owner_row.owner_id),'[]'::jsonb)
      ),now())
    on conflict(owner_id,backup_day) do update set snapshot=excluded.snapshot,captured_at=excluded.captured_at;
    saved_count:=saved_count+1;
  end loop;
  delete from agency_backups where captured_at < now()-interval '30 days';
  return saved_count;
end;
$$;
revoke all on function public.agency_backup_all() from public,anon,authenticated;
grant execute on function public.agency_backup_all() to service_role;


-- ===== notification-delivery.sql =====

-- Optional daily owner digest deduplication.
-- Job requires Resend provider and explicit owner email + owner UUID configuration.
create table if not exists public.agency_notification_delivery (
  owner_id uuid not null references auth.users(id) on delete cascade,
  delivery_day date not null,
  kind text not null,
  delivered_at timestamptz not null default now(),
  primary key (owner_id,delivery_day,kind)
);
alter table public.agency_notification_delivery enable row level security;
revoke all on public.agency_notification_delivery from anon,authenticated;


select to_regprocedure('public.agency_load_workspace()') is not null as loader_ready,
 to_regprocedure('public.agency_apply_patch(jsonb,bigint)') is not null as writer_ready,
 to_regclass('public.agency_clients') is not null as clients_ready,
 to_regclass('public.agency_stripe_events') is not null as stripe_ready,
 to_regclass('public.agency_public_links') is not null as public_links_ready;

-- ===== migrations/3.5-reliability.sql =====
-- PAID HUSTLE OS 3.5. Additive migration for an existing v3.4 relational workspace.
-- No user records are deleted or rewritten. Apply after the v3.4 base setup.
begin;
-- Background writers and browser patches share the same owner lock and revision.
create or replace function public.agency_lock_revision()
returns trigger language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
 oid:=case when TG_OP='DELETE' then OLD.owner_id else NEW.owner_id end;
 insert into agency_preferences(owner_id) values(oid) on conflict(owner_id) do nothing;
 update agency_preferences set revision=revision+1,updated_at=now() where owner_id=oid;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function public.agency_lock_revision() from public,anon,authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['agency_clients','agency_leads','agency_projects','agency_tasks','agency_transactions','agency_operations','agency_activity'] loop
  execute format('drop trigger if exists agency_revision_lock on public.%I',tbl);
  execute format('create trigger agency_revision_lock before insert or update or delete on public.%I for each row execute function public.agency_lock_revision()',tbl);
 end loop;
end $$;

-- Browser accounts may read receipts but cannot invent, alter or delete Stripe receipts.
create or replace function public.agency_protect_stripe()
returns trigger language plpgsql security invoker set search_path=public as $$
declare oldp jsonb; newp jsonb;
begin
 if coalesce(auth.role(),'')='service_role' then
  if TG_OP='DELETE' then return OLD; end if; return NEW;
 end if;
 oldp:=case when TG_OP='INSERT' then '{}'::jsonb else OLD.payload end;
 newp:=case when TG_OP='DELETE' then '{}'::jsonb else NEW.payload end;
 if TG_TABLE_NAME='agency_transactions' then
  if coalesce(oldp->>'id','') like 'stripe:%' or coalesce(newp->>'id','') like 'stripe:%'
    or oldp->>'paymentSource'='stripe' or newp->>'paymentSource'='stripe' then
   raise exception 'Stripe receipts can only be changed by the verified payment service' using errcode='42501';
  end if;
 elsif TG_TABLE_NAME='agency_operations' then
  if TG_OP='INSERT' then
   select coalesce(payload,'{}'::jsonb) into oldp from agency_operations where owner_id=NEW.owner_id and id=NEW.id;
   oldp:=coalesce(oldp,'{}'::jsonb);
  end if;
  if oldp->>'paymentSource'='stripe' or oldp ? 'stripePaymentId' then
   if TG_OP='DELETE' or exists(select 1 from unnest(array['status','amount','currency','vatRate','paymentSource','stripePaymentId','stripeInvoiceId','clientId','projectId']) k where oldp->k is distinct from newp->k) then
    raise exception 'Verified payment fields are read-only' using errcode='42501';
   end if;
  elsif newp->>'paymentSource'='stripe' or newp ? 'stripePaymentId' then
   raise exception 'Only the payment service can confirm Stripe payments' using errcode='42501';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function public.agency_protect_stripe() from public,anon,authenticated;
drop trigger if exists agency_payment_guard on public.agency_transactions;
create trigger agency_payment_guard before insert or update or delete on public.agency_transactions for each row execute function public.agency_protect_stripe();
drop trigger if exists agency_payment_guard on public.agency_operations;
create trigger agency_payment_guard before insert or update or delete on public.agency_operations for each row execute function public.agency_protect_stripe();

-- One transaction records the receipt, invoice status and event marker. Retried events
-- and two event types for the same Checkout cannot double count collected revenue.
create or replace function public.agency_record_stripe_payment(p_owner uuid,p_record text,p_event text,p_event_type text,p_payment text,p_amount_cents bigint,p_currency text,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path=public as $$
declare invoice agency_operations%rowtype; tx jsonb; paid jsonb; expected bigint; vat numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 insert into agency_preferences(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 perform 1 from agency_preferences where owner_id=p_owner for update;
 if exists(select 1 from agency_stripe_events where id=p_event) then return 'Already processed'; end if;
 select * into invoice from agency_operations where owner_id=p_owner and id=p_record for update;
 if not found or invoice.category<>'invoices' then raise exception 'Invoice not found'; end if;
 vat:=coalesce((invoice.payload->>'vatRate')::numeric,0);
 if vat<0 or vat>100 then raise exception 'Invalid VAT'; end if;
 expected:=round((invoice.payload->>'amount')::numeric*(1+vat/100)*100);
 if expected is null or p_amount_cents<=0 or expected<>p_amount_cents or lower(coalesce(invoice.payload->>'currency','DKK'))<>lower(p_currency) then raise exception 'Amount/currency mismatch'; end if;
 if p_event is null or p_payment is null or length(p_payment)>180 then raise exception 'Invalid payment identifiers'; end if;
 tx:=jsonb_build_object('id','stripe:'||p_payment,'description','Stripe payment: '||(invoice.payload->>'title'),'clientId',coalesce(invoice.client_id,''),'projectId',coalesce(invoice.project_id,''),'invoiceId',p_record,'paymentSource','stripe','stripePaymentId',p_payment,'amount',p_amount_cents::numeric/100,'currency',upper(p_currency),'kind','Income','status','Paid','date',to_char(p_paid_at at time zone 'Europe/Copenhagen','YYYY-MM-DD'),'notes','Verified Stripe payment '||p_payment,'createdAt',p_paid_at);
 insert into agency_transactions(owner_id,id,client_id,project_id,amount,kind,payload)
 values(p_owner,tx->>'id',invoice.client_id,invoice.project_id,p_amount_cents::numeric/100,'Income',tx) on conflict(owner_id,id) do nothing;
 paid:=invoice.payload||jsonb_build_object('status','Paid','paymentSource','stripe','stripePaymentId',p_payment,'updatedAt',now());
 update agency_operations set payload=paid,updated_at=now() where owner_id=p_owner and id=p_record;
 insert into agency_stripe_events(id,owner_id,record_id,event_type) values(p_event,p_owner,p_record,p_event_type);
 return 'Payment reconciled';
end $$;
revoke all on function public.agency_record_stripe_payment(uuid,text,text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.agency_record_stripe_payment(uuid,text,text,text,text,bigint,text,timestamptz) to service_role;
-- Keep the existing bucket private, without deleting or moving any objects.
update storage.buckets set public=false where id='agency-documents';

-- Consume a public token, store its receipt, and update the linked record together.
-- A failed request rolls back token consumption, so the client can safely retry.
create or replace function public.agency_submit_public_response(p_token_hash text,p_expected_record jsonb,p_response jsonb,p_operation jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare link agency_public_links%rowtype; record agency_operations%rowtype; accepted text; changed jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into link from agency_public_links where token_hash=p_token_hash;
 if not found then raise exception 'Link unavailable'; end if;
 insert into agency_preferences(owner_id) values(link.owner_id) on conflict(owner_id) do nothing;
 perform 1 from agency_preferences where owner_id=link.owner_id for update;
 select * into link from agency_public_links where token_hash=p_token_hash for update;
 if link.used_at is not null or link.expires_at<=now() then raise exception 'Link already used or expired'; end if;
 select * into record from agency_operations where owner_id=link.owner_id and id=link.record_id for update;
 if not found or record.payload is distinct from p_expected_record then raise exception 'Record changed; request a new link'; end if;
 if link.kind='approval' and (p_response->>'acknowledged'<>'true' or p_response->>'reviewHash' is distinct from link.review_hash) then raise exception 'Review acknowledgement required'; end if;
 insert into agency_public_submissions(owner_id,link_id,kind,payload) values(link.owner_id,link.id,link.kind,p_response);
 insert into agency_operations(owner_id,id,client_id,project_id,category,title,due_date,payload)
 values(link.owner_id,p_operation->>'id',record.client_id,record.project_id,p_operation->>'category',p_operation->>'title',nullif(p_operation->>'dueDate','')::date,p_operation);
 if link.kind='approval' and p_response->>'decision'='approved' then
  accepted:=case record.category when 'proposals' then 'Accepted' when 'qa' then 'Approved to launch' when 'handovers' then 'Handed over' when 'reports' then 'Reviewed' when 'documents' then 'Approved' end;
 elsif link.kind='intake' then accepted:='Received';
 elsif link.kind='booking' then accepted:='Requested'; end if;
 if accepted is not null then
  changed:=record.payload||jsonb_build_object('status',accepted,'updatedAt',now());
  if link.kind='booking' then changed:=changed||jsonb_build_object('dueDate',p_response->>'date'); end if;
  update agency_operations set payload=changed,due_date=nullif(changed->>'dueDate','')::date,updated_at=now() where owner_id=link.owner_id and id=link.record_id;
 end if;
 update agency_public_links set used_at=now() where id=link.id;
 return 'Response recorded';
end $$;
revoke all on function public.agency_submit_public_response(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.agency_submit_public_response(text,jsonb,jsonb,jsonb) to service_role;

commit;

select to_regprocedure('public.agency_record_stripe_payment(uuid,text,text,text,text,bigint,text,timestamptz)') is not null as atomic_payments_ready, to_regprocedure('public.agency_submit_public_response(text,jsonb,jsonb,jsonb)') is not null as atomic_public_responses_ready;
