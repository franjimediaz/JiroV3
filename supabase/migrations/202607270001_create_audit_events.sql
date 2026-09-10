create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid null,
  tenant_id uuid null,
  action text not null,
  resource_type text null,
  resource_id text null,
  request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  success boolean not null default false
);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_no_client_select on public.audit_events;
drop policy if exists audit_events_no_client_insert on public.audit_events;
drop policy if exists audit_events_no_client_update on public.audit_events;
drop policy if exists audit_events_no_client_delete on public.audit_events;

create policy audit_events_no_client_select
on public.audit_events
for select
to authenticated
using (false);

create policy audit_events_no_client_insert
on public.audit_events
for insert
to authenticated
with check (false);

create policy audit_events_no_client_update
on public.audit_events
for update
to authenticated
using (false)
with check (false);

create policy audit_events_no_client_delete
on public.audit_events
for delete
to authenticated
using (false);

create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_actor_user_id_idx on public.audit_events (actor_user_id);
create index if not exists audit_events_request_id_idx on public.audit_events (request_id);

comment on table public.audit_events is 'Server-side security audit log. Writes are performed only by trusted backend service_role after authorization.';
