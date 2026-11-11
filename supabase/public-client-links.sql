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
