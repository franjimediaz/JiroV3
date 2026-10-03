begin;
do $$
declare
 owner uuid;
 other_user uuid := '00000000-0000-4000-8000-000000000002';
 report_id uuid := gen_random_uuid();
 affected integer;
begin
 select id into owner from auth.users order by created_at limit 1;
 if owner is null then raise exception 'RLS test requires an existing user'; end if;
 perform set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true);
 set local role authenticated;
 insert into public.report_definitions(id,owner_id,name,type,source_module,config)
 values(report_id,owner,'RLS probe','list','probe','{}');
 if (select count(*) from public.report_definitions where id=report_id) <> 1 then raise exception 'Owner SELECT failed'; end if;
 update public.report_definitions set name='RLS updated' where id=report_id;
 get diagnostics affected = row_count;
 if affected <> 1 then raise exception 'Owner UPDATE failed'; end if;
 begin
  update public.report_definitions set owner_id=other_user where id=report_id;
  raise exception 'Owner transfer should be denied';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims', jsonb_build_object('sub',other_user,'role','authenticated')::text, true);
 if (select count(*) from public.report_definitions where id=report_id) <> 0 then raise exception 'Cross-owner SELECT allowed'; end if;
 update public.report_definitions set name='forbidden' where id=report_id;
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-owner UPDATE allowed'; end if;
 delete from public.report_definitions where id=report_id;
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-owner DELETE allowed'; end if;
 begin
  insert into public.report_definitions(owner_id,name,type,source_module,config) values(owner,'forbidden','list','probe','{}');
  raise exception 'Cross-owner INSERT should be denied';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true);
 delete from public.report_definitions where id=report_id;
 get diagnostics affected = row_count;
 if affected <> 1 then raise exception 'Owner DELETE failed'; end if;
 reset role;
 if has_table_privilege('anon','public.report_definitions','select') or has_table_privilege('anon','public.report_definitions','insert') then raise exception 'Anon privileges found'; end if;
end;
$$;
select 'PASS owner CRUD, cross-owner denial, transfer denial and anon grants; rolled back' as result;
rollback;
