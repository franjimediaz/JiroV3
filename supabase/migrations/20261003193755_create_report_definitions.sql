create table public.report_definitions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 120),
 description text not null default '' check (char_length(description) <= 2000),
 type text not null check (type in ('list', 'matrix')),
 source_module text not null check (char_length(source_module) between 1 and 100),
 config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 70000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.report_definitions enable row level security;
revoke all on public.report_definitions from public, anon, authenticated;
grant select, insert, update, delete on public.report_definitions to authenticated;
grant all on public.report_definitions to service_role;
create policy reports_owner_select on public.report_definitions for select to authenticated using ((select auth.uid()) = owner_id);
create policy reports_owner_insert on public.report_definitions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy reports_owner_update on public.report_definitions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy reports_owner_delete on public.report_definitions for delete to authenticated using ((select auth.uid()) = owner_id);
create index report_definitions_owner_updated_idx on public.report_definitions(owner_id, updated_at desc);
create function public.report_definitions_timestamp() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 new.updated_at = now();
 new.created_at = old.created_at;
 return new;
end;
$$;
revoke all on function public.report_definitions_timestamp() from public, anon, authenticated;
create trigger report_definitions_timestamp before update on public.report_definitions for each row execute function public.report_definitions_timestamp();
