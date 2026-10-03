alter table public.users add column if not exists surname text;

create table public.profile_email_changes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 old_auth_email text not null,
 old_db_email text,
 new_email text not null,
 status text not null check (status in ('starting','pending_confirmation','applying','completed','rolled_back','reconciliation_required')),
 reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index profile_email_changes_one_open on public.profile_email_changes(user_id)
 where status in ('starting','pending_confirmation','applying','reconciliation_required');
alter table public.profile_email_changes enable row level security;
revoke all on public.profile_email_changes from public, anon, authenticated;
grant select, insert, update on public.profile_email_changes to service_role;
comment on table public.profile_email_changes is 'Server-only email change journal. starting/applying entries left by interrupted requests require reconciliation; never expire or unlock blindly. No passwords or tokens.';
