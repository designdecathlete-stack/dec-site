-- Run after the migration in the SAME transaction. Always roll back fixtures.
-- No filesystem LPs, Google requests, or persistent user changes are made.
insert into auth.users (id, email) values
  ('fba40000-0000-0000-0000-000000000001', 'analytics-admin-test@example.invalid'),
  ('fba40000-0000-0000-0000-000000000002', 'analytics-member-test@example.invalid'),
  ('fba40000-0000-0000-0000-000000000003', 'analytics-outsider-test@example.invalid');
insert into public.clients (id,name,slug,ga4_property_id)
values ('fba40000-0000-0000-0000-000000000010','Analytics test','analytics-rls-test','111');
insert into public.lp_projects (id,client_id,name,slug,folder_path,public_url,ga4_page_path)
select ('fba40000-0000-0000-0000-00000000002'||n)::uuid,
  'fba40000-0000-0000-0000-000000000010','Analytics test '||n,'test-'||n,
  '__analytics_rls_test_'||n,'https://example.invalid/test-'||n,'/test-'||n||'/'
from generate_series(1,2) n;
insert into public.user_roles (user_id,role,client_id) values
  ('fba40000-0000-0000-0000-000000000001','admin',null),
  ('fba40000-0000-0000-0000-000000000002','lp_dashboard','fba40000-0000-0000-0000-000000000010'),
  ('fba40000-0000-0000-0000-000000000003','lp_dashboard','fba40000-0000-0000-0000-000000000010');
insert into public.lp_project_memberships (user_id,lp_project_id)
values ('fba40000-0000-0000-0000-000000000002','fba40000-0000-0000-0000-000000000021');

set local role authenticated;
select set_config('request.jwt.claim.sub','fba40000-0000-0000-0000-000000000001',true);
insert into public.lp_analytics_settings (lp_project_id,ga4_property_id)
values ('fba40000-0000-0000-0000-000000000021','222'),
  ('fba40000-0000-0000-0000-000000000022',null);
do $$ begin
  assert (select count(*)=2 from public.lp_analytics_settings where lp_project_id::text like 'fba40000%'), 'admin read';
  assert (select ga4_property_id='222' and ga4_page_path='/test-1/' from public.lp_dashboard_overview where lp_project_id='fba40000-0000-0000-0000-000000000021'), 'LP priority / per-field fallback';
  assert (select ga4_property_id='111' from public.lp_dashboard_overview where lp_project_id='fba40000-0000-0000-0000-000000000022'), 'sibling fallback';
end $$;
update public.lp_analytics_settings set is_active=false where lp_project_id='fba40000-0000-0000-0000-000000000021';
do $$ begin
  assert (select ga4_connection_status='disabled' from public.lp_dashboard_overview where lp_project_id='fba40000-0000-0000-0000-000000000021'), 'disabled status';
end $$;
delete from public.lp_analytics_settings where lp_project_id='fba40000-0000-0000-0000-000000000022';
insert into public.lp_analytics_settings (lp_project_id) values ('fba40000-0000-0000-0000-000000000022');

select set_config('request.jwt.claim.sub','fba40000-0000-0000-0000-000000000002',true);
do $$ declare affected integer; begin
  assert (select count(*)=1 from public.lp_analytics_settings), 'member sees only assigned LP';
  update public.lp_analytics_settings set ga4_property_id='999';
  get diagnostics affected = row_count;
  assert affected=0, 'member cannot update';
  delete from public.lp_analytics_settings;
  get diagnostics affected = row_count;
  assert affected=0, 'member cannot delete';
  begin
    insert into public.lp_analytics_settings (lp_project_id) values ('fba40000-0000-0000-0000-000000000022');
    raise exception 'member insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','fba40000-0000-0000-0000-000000000003',true);
do $$ begin
  assert (select count(*)=0 from public.lp_analytics_settings), 'same-client nonmember sees no settings';
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.lp_analytics_settings;
    raise exception 'anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: admin CRUD, member read-only, same-client isolation, anon denied, LP priority/fallback, disabled status' as result;
