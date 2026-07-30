-- Landing page waitlist signups. Written only by the service role via
-- POST /api/waitlist; no client access.
create table waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  city text,
  format text not null check (format in ('5', '6', '7', 'mixed')),
  created_at timestamptz not null default now()
);

create unique index waitlist_signups_email_key on waitlist_signups (lower(email));

alter table waitlist_signups enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) touches this table.
