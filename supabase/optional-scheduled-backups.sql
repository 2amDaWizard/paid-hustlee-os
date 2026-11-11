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
