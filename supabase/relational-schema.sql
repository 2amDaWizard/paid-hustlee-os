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
