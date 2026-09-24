create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid null,
  tenant_id uuid null,
  module text null,
  action text not null,
  resource_type text null,
  resource_id text null,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  success boolean not null default false
);

alter table public.audit_events add column if not exists module text null;
alter table public.audit_events alter column request_id type text using request_id::text;

alter table public.audit_events enable row level security;

drop policy if exists audit_events_no_client_select on public.audit_events;
drop policy if exists audit_events_no_client_insert on public.audit_events;
drop policy if exists audit_events_no_client_update on public.audit_events;
drop policy if exists audit_events_no_client_delete on public.audit_events;

revoke all on public.audit_events from public;
revoke all on public.audit_events from anon;
revoke all on public.audit_events from authenticated;
grant select, insert on public.audit_events to service_role;

create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_actor_user_id_idx on public.audit_events (actor_user_id);
create index if not exists audit_events_module_action_idx on public.audit_events (module, action);
create index if not exists audit_events_resource_id_idx on public.audit_events (resource_id);
create index if not exists audit_events_request_id_idx on public.audit_events (request_id);

comment on table public.audit_events is 'Server-side security audit log. Writes are performed only by trusted backend service_role after authorization.';
