\set ON_ERROR_STOP on
create extension if not exists pgtap;
begin;
select plan(10);

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cypher_claim_outbox','cypher_complete_outbox','cypher_fail_outbox') and p.prosecdef),'outbox public wrappers are security invoker');
select ok(not has_function_privilege('anon','public.cypher_claim_outbox(integer)','execute'),'anonymous cannot claim jobs');
select ok(not has_function_privilege('authenticated','public.cypher_claim_outbox(integer)','execute'),'authenticated cannot claim jobs');
select ok(has_function_privilege('service_role','public.cypher_claim_outbox(integer)','execute'),'service role may claim jobs');

insert into public.cypher_outbox(id,tenant_id,topic,aggregate_id,idempotency_key,payload)
values('77777777-1000-4000-8000-000000000001','a0a00000-0000-4000-8000-000000000001','extract','77777777-2000-4000-8000-000000000002','outbox-worker-test','{}');

set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select is((select count(*) from public.cypher_claim_outbox(1)),1::bigint,'service worker claims one job');
reset role;
select is((select status from public.cypher_outbox where id='77777777-1000-4000-8000-000000000001'),'processing','claim transitions to processing');
select is((select attempt_count from public.cypher_outbox where id='77777777-1000-4000-8000-000000000001'),1,'claim increments attempt count');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select is(public.cypher_fail_outbox('77777777-1000-4000-8000-000000000001','synthetic failure',3),'retrying','first failure schedules retry');
reset role;
update public.cypher_outbox set available_at=now() where id='77777777-1000-4000-8000-000000000001';
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select is((select count(*) from public.cypher_claim_outbox(1)),1::bigint,'retry is claimable after availability');
select lives_ok($$select public.cypher_complete_outbox('77777777-1000-4000-8000-000000000001')$$,'processing job completes');

select * from finish();
rollback;
