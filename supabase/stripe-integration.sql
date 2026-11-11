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
