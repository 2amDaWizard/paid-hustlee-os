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
