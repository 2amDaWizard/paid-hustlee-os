-- Run in Supabase SQL Editor once. Client uses the PUBLIC publishable/anon key.
-- Every workspace is accessible only to its authenticated owner.
create table if not exists public.workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create policy "Owner can read their workspace"
  on public.workspaces for select to authenticated
  using (auth.uid() = owner_id);

create policy "Owner can create their workspace"
  on public.workspaces for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "Owner can update their workspace"
  on public.workspaces for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owner can delete their workspace"
  on public.workspaces for delete to authenticated
  using (auth.uid() = owner_id);

-- For a one-person system, create your ONE account via Authentication > Users
-- then turn OFF public sign-ups under Authentication settings.
