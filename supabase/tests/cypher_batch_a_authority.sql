\set ON_ERROR_STOP on
create extension if not exists pgtap;
begin;
select plan(24);

delete from public.cypher_tenants where id in ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
delete from auth.users where id in ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
insert into auth.users(id) values ('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
insert into auth.sessions(id,user_id) values ('cccccccc-0000-4000-8000-000000000003','33333333-3333-4333-8333-333333333333'),('dddddddd-0000-4000-8000-000000000004','44444444-4444-4444-8444-444444444444');
insert into public.cypher_tenants(id,legacy_id,name) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','batch-a','Batch A'),('dddddddd-dddd-4ddd-8ddd-dddddddddddd','batch-b','Batch B');
insert into public.cypher_memberships(tenant_id,user_id,role,status) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','owner','active'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','33333333-3333-4333-8333-333333333333','owner','inactive'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','owner','active');

set role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-0000-4000-8000-000000000003"}',false);
select lives_ok($$select public.cypher_create_upload_intent('cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,'invoice.pdf','invoice',100,'batch-a-key')$$,'authorized upload intent succeeds');
select is((select count(*) from public.cypher_upload_intents where idempotency_key='batch-a-key'),1::bigint,'one awaiting upload intent');
select is((select count(*) from public.cypher_documents where idempotency_key='batch-a-key'),0::bigint,'caller metadata creates no document');
select is((select count(*) from public.cypher_intake_events where upload_intent_id=(select id from public.cypher_upload_intents where idempotency_key='batch-a-key')),0::bigint,'caller metadata creates no audit');
select is((select count(*) from public.cypher_outbox where idempotency_key='batch-a-key'),0::bigint,'caller metadata creates no queue command');
select throws_ok($$select public.cypher_create_upload_intent('dddddddd-dddd-4ddd-8ddd-dddddddddddd',null,'cross.pdf','invoice',100,'cross-key')$$,'tenant write authorization required','inactive cross-tenant membership denied');
select throws_ok($$select private.cypher_finalize_verified_upload(gen_random_uuid())$$,'permission denied for function cypher_finalize_verified_upload','authenticated caller cannot finalize');
select throws_ok($$insert into public.cypher_trusted_upload_receipts(id,tenant_id,upload_intent_id,document_id,object_path,content_hash,size_bytes,verification_method,verified_at) select gen_random_uuid(),tenant_id,id,gen_random_uuid(),'forged/path',repeat('a',64),100,'storage_api_head_streamed_sha256',now() from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'permission denied for table cypher_trusted_upload_receipts','authenticated caller cannot insert trusted receipt');
select throws_ok($$select public.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-2000-4000-8000-000000000002',tenant_id::text||'/'||id::text||'/original/'||repeat('e',64)||'.pdf',repeat('e',64),100,'fabricated-etag') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'permission denied for function cypher_commit_verified_upload','tenant writer cannot forge server verification RPC');
select is((select count(*) from storage.objects where name like 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/%'),0::bigint,'forged RPC has no Storage object');
select is((select count(*) from public.cypher_documents where id='eeeeeeee-2000-4000-8000-000000000002'),0::bigint,'forged RPC creates no document');
select is((select count(*) from public.cypher_trusted_upload_receipts where document_id='eeeeeeee-2000-4000-8000-000000000002'),0::bigint,'forged RPC creates no trusted receipt');
select is((select count(*) from public.cypher_outbox where aggregate_id='eeeeeeee-2000-4000-8000-000000000002'),0::bigint,'forged RPC creates no outbox command');

reset role; set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select throws_ok($$select private.cypher_finalize_verified_upload('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,'trusted upload receipt required','missing receipt cannot finalize');
select throws_ok($$insert into public.cypher_trusted_upload_receipts(id,tenant_id,upload_intent_id,document_id,object_path,content_hash,size_bytes,storage_version,verification_method,verified_at) select gen_random_uuid(),tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original.pdf',repeat('e',64),100,'v1','storage_api_head_streamed_sha256',now() from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'permission denied for table cypher_trusted_upload_receipts','service role cannot bypass guarded receipt insert');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original.pdf',repeat('e',64),99,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted receipt size mismatch','guarded commit rejects mismatched observation');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original/'||repeat('e',64)||'.pdf.extra',repeat('e',64),100,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted canonical object path required','extra suffix rejected');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original/../'||repeat('e',64)||'.pdf',repeat('e',64),100,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted canonical object path required','traversal rejected');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original/'||upper(repeat('e',64))||'.pdf',repeat('e',64),100,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted canonical object path required','uppercase hash rejected');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/alternate/'||repeat('e',64)||'.pdf',repeat('e',64),100,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted canonical object path required','alternate path rejected');
select throws_ok($$select private.cypher_commit_verified_upload(tenant_id,id,'eeeeeeee-1000-4000-8000-000000000001',tenant_id::text||'/'||id::text||'/original/'||repeat('f',64)||'.pdf',repeat('e',64),100,'v1') from public.cypher_upload_intents where idempotency_key='batch-a-key'$$,'trusted canonical object path required','filename hash mismatch rejected');
select is((select count(*) from public.cypher_documents where id='eeeeeeee-1000-4000-8000-000000000001'),0::bigint,'failed finalization is atomic');
select throws_ok($$update public.cypher_trusted_upload_receipts set size_bytes=100$$,'permission denied for table cypher_trusted_upload_receipts','service role cannot update trusted receipts');
select throws_ok($$delete from public.cypher_trusted_upload_receipts$$,'permission denied for table cypher_trusted_upload_receipts','service role cannot delete trusted receipts');
select * from finish();
rollback;
