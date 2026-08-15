\set ON_ERROR_STOP on
create extension if not exists pgtap;
select plan(23);

-- Dependency-safe teardown is intentionally exercised at both ends of the suite.
delete from public.cypher_tenants where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into auth.sessions(id,user_id) values ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222');
insert into public.cypher_tenants(id,legacy_id,name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tenant-a','Tenant A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','tenant-b','Tenant B');
insert into public.cypher_memberships(tenant_id,user_id,role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','viewer');

set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
insert into public.cypher_documents(id,tenant_id,legacy_id,document_type,original_path,original_hash,created_by) values
('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','doc-a','invoice','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/original.pdf',repeat('a',64),auth.uid()),
('aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','doc-b','purchase_order','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-b/original.pdf',repeat('b',64),auth.uid());
do $$ begin begin insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes) values(gen_random_uuid(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-1000-4000-8000-000000000001','cross','original','x/cross.pdf',repeat('c',64),1); raise exception 'cross tenant accepted'; exception when foreign_key_violation or insufficient_privilege then null; end; end $$;
select pass('cross-tenant composite references are rejected');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-0000-4000-8000-000000000002"}',false);
do $$ begin begin insert into public.cypher_documents(id,tenant_id,legacy_id,document_type,original_path,original_hash,created_by) values(gen_random_uuid(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','viewer-doc','invoice','b/viewer.pdf',repeat('d',64),auth.uid()); raise exception 'viewer wrote'; exception when insufficient_privilege then null; end; begin perform private.transition_obligation(gen_random_uuid(),'disputed','x'); raise exception 'foreign rpc succeeded'; exception when raise_exception then if sqlerrm='foreign rpc succeeded' then raise; end if; end; end $$;
select pass('viewer and foreign auth.uid cannot write or invoke tenant transitions');

reset role;
do $$ declare t text; begin foreach t in array array['cypher_locations','cypher_vendors','cypher_quarantine_scans','cypher_outbox','cypher_extraction_runs','cypher_extraction_fields','cypher_corrections','cypher_relationships','cypher_relationship_decisions','cypher_exceptions','cypher_exception_events','cypher_obligations','cypher_obligation_events','cypher_evidence_packages','cypher_export_jobs','cypher_connectors','cypher_deliveries','cypher_delivery_attempts','cypher_destination_receipts','cypher_storage_receipts'] loop if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) or not has_table_privilege('authenticated','public.'||t,'select') or has_table_privilege('authenticated','public.'||t,'update') or has_table_privilege('authenticated','public.'||t,'delete') then raise exception 'bad privilege: %',t; end if; end loop; if has_table_privilege('authenticated','public.cypher_relationship_decisions','insert') or has_table_privilege('authenticated','public.cypher_storage_receipts','insert') or has_table_privilege('authenticated','public.cypher_destination_receipts','insert') or has_table_privilege('authenticated','public.cypher_deliveries','insert') then raise exception 'direct append bypass'; end if; end $$;
select pass('RLS and grants deny rewrites and trusted-table direct inserts');

set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
insert into public.cypher_extraction_runs(id,tenant_id,document_id,version,provider,model_version,language) values('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001',1,'fixture','v1','bilingual');
insert into public.cypher_extraction_fields(id,tenant_id,extraction_id,field_key,normalized_value,page_number,bounding_box,text_span) values('aaaaaaaa-2100-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-2000-4000-8000-000000000001','invoice_number','"A-1"',1,'[1,2,3,4]','[0,3]');
insert into public.cypher_corrections(id,tenant_id,document_id,extraction_id,field_key,corrected_value,corrected_by) values('aaaaaaaa-2200-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-2000-4000-8000-000000000001','invoice_number','"A1"',auth.uid());
do $$ begin begin insert into public.cypher_corrections(id,tenant_id,document_id,extraction_id,field_key,corrected_value,corrected_by) values(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-2000-4000-8000-000000000001','x','1',auth.uid()); raise exception 'wrong document correction'; exception when foreign_key_violation then null; end; begin update public.cypher_corrections set corrected_value='2' where id='aaaaaaaa-2200-4000-8000-000000000001'; raise exception 'correction rewritten'; exception when insufficient_privilege then null; end; end $$;
select pass('grounding and correction linkage are behavioral and append-only');

insert into public.cypher_obligations(id,tenant_id,document_id,state,amount_minor,policy_version) values('aaaaaaaa-3000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','unconfirmed',500,'v1');
select private.transition_obligation('aaaaaaaa-3000-4000-8000-000000000001','confirmed_outstanding','human confirmed');
do $$ begin if not exists(select 1 from public.cypher_obligation_events where obligation_id='aaaaaaaa-3000-4000-8000-000000000001' and actor_user_id=auth.uid()) then raise exception 'audit missing'; end if; begin update public.cypher_obligations set state='cleared'; raise exception 'direct edit'; exception when insufficient_privilege then null; end; end $$;
select pass('obligation transition is human-bound and audited');

insert into public.cypher_exceptions(id,tenant_id,document_id,kind) values('aaaaaaaa-3100-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','variance');
select private.transition_exception('aaaaaaaa-3100-4000-8000-000000000001','resolved','reviewed',auth.uid());
do $$ begin begin perform private.transition_exception('aaaaaaaa-3100-4000-8000-000000000001','acknowledged','again'); raise exception 'terminal exception changed'; exception when raise_exception then if sqlerrm='terminal exception changed' then raise; end if; end; if not exists(select 1 from public.cypher_exception_events where exception_id='aaaaaaaa-3100-4000-8000-000000000001' and event_type='resolved') then raise exception 'exception audit missing'; end if; end $$;
select pass('exception transitions are audited and terminal guarded');

insert into public.cypher_relationships(id,tenant_id,source_document_id,related_document_id,relationship_type,detector_version,explanation) values('aaaaaaaa-3200-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000002','po_match','v1','{"rule":"same_po","facts":[]}');
select private.transition_relationship('aaaaaaaa-3200-4000-8000-000000000001','confirmed','human matched');
do $$ begin if not exists(select 1 from public.cypher_relationships where id='aaaaaaaa-3200-4000-8000-000000000001' and status='confirmed' and decided_by=auth.uid()) or not exists(select 1 from public.cypher_relationship_decisions where relationship_id='aaaaaaaa-3200-4000-8000-000000000001' and actor_user_id=auth.uid()) then raise exception 'relationship atomicity missing'; end if; begin perform private.transition_relationship('aaaaaaaa-3200-4000-8000-000000000001','dismissed','again'); raise exception 'terminal relationship changed'; exception when raise_exception then if sqlerrm='terminal relationship changed' then raise; end if; end; end $$;
select pass('relationship RPC atomically transitions and appends immutable decision');

insert into public.cypher_validations(id,tenant_id,document_id,legacy_id,decision,evidence_manifest_hash,validator_user_id,validated_at) values
('aaaaaaaa-4000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','val-good','approved',repeat('e',64),auth.uid(),now()),
('aaaaaaaa-4000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','val-bad','approved',repeat('1',64),auth.uid(),now());
insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes) values
('aaaaaaaa-4050-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','original-a','original','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/original.pdf',repeat('a',64),10),
('aaaaaaaa-4100-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','manifest-a','evidence_manifest','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/manifest.json',repeat('e',64),10),
('aaaaaaaa-4200-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','pdf-a','validation_pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/validation.pdf',repeat('f',64),10);
reset role;
do $$ begin begin insert into public.cypher_storage_receipts(id,tenant_id,document_id,artifact_id,object_path,content_hash,size_bytes,verification_method,verified_at) values(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000002','aaaaaaaa-4100-4000-8000-000000000001','wrong',repeat('e',64),10,'storage_api_head_sha256',now()); raise exception 'spoofed linkage accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('Storage receipts cannot spoof artifact/document linkage');
insert into public.cypher_storage_receipts(id,tenant_id,document_id,artifact_id,object_path,content_hash,size_bytes,verification_method,verified_at) values
(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-4050-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/original.pdf',repeat('a',64),10,'storage_api_head_sha256',now()),
(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-4100-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/manifest.json',repeat('e',64),10,'storage_api_head_sha256',now()),
(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-4200-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/validation.pdf',repeat('f',64),10,'storage_api_head_sha256',now());
update public.cypher_documents set status='needs_review' where id='aaaaaaaa-1000-4000-8000-000000000001';
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
do $$ begin begin perform private.finalize_validation('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-4000-4000-8000-000000000002','aaaaaaaa-4100-4000-8000-000000000001','aaaaaaaa-4200-4000-8000-000000000001'); raise exception 'mismatched manifest finalized'; exception when raise_exception then if sqlerrm='mismatched manifest finalized' then raise; end if; end; if exists(select 1 from public.cypher_evidence_packages) or (select status from public.cypher_documents where id='aaaaaaaa-1000-4000-8000-000000000001')<>'needs_review' then raise exception 'failed finalize was not atomic'; end if; end $$;
select pass('finalize rejects manifest mismatch and rolls back atomically');

select private.finalize_validation('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-4000-4000-8000-000000000001','aaaaaaaa-4100-4000-8000-000000000001','aaaaaaaa-4200-4000-8000-000000000001');
do $$ declare expected text; begin select encode(extensions.digest(convert_to(jsonb_build_object('document_id',p.document_id,'manifest_artifact_id',p.manifest_artifact_id,'manifest_hash',repeat('e',64),'pdf_artifact_id',p.pdf_artifact_id,'pdf_hash',repeat('f',64),'schema','cypher-evidence/v1','source_hash',p.source_hash,'tenant_id',p.tenant_id,'validation_id',p.validation_id,'version',p.version)::text,'utf8'),'sha256'),'hex') into expected from public.cypher_evidence_packages p; if not exists(select 1 from public.cypher_evidence_packages p join public.cypher_documents d on (d.tenant_id,d.id)=(p.tenant_id,p.document_id) where p.package_hash=expected and d.evidence_hash=expected and d.status='validated' and d.validation_version=1) then raise exception 'canonical finalize mismatch'; end if; end $$;
select pass('successful finalize computes canonical hash and atomically validates document');

reset role; insert into public.cypher_connectors(id,tenant_id,connector_type,display_name,status,revoked_at) values
('aaaaaaaa-5100-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','simulated','active fixture','active',null),
('aaaaaaaa-5100-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','simulated','revoked fixture','revoked',now());
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
do $$ begin begin insert into public.cypher_deliveries(id,tenant_id,connector_id,evidence_package_id,idempotency_key,source_hash,requested_by) select gen_random_uuid(),tenant_id,'aaaaaaaa-5100-4000-8000-000000000001',id,'forged',repeat('0',64),auth.uid() from public.cypher_evidence_packages; raise exception 'forged direct delivery accepted'; exception when insufficient_privilege then null; end; begin insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,observed_hash,verification_state,observed_at) values(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'spoof',repeat('0',64),'observed_digest',now()); raise exception 'client receipt accepted'; exception when insufficient_privilege then null; end; end $$;
select pass('direct delivery/source-hash and destination-receipt bypasses are denied');
do $$ begin begin perform private.request_delivery('aaaaaaaa-5100-4000-8000-000000000002',(select id from public.cypher_evidence_packages limit 1),'revoked-request'); raise exception 'revoked connector requested'; exception when raise_exception then if sqlerrm='revoked connector requested' then raise; end if; end; end $$;
select pass('revoked connector is rejected at request time');
do $$ declare a uuid; b uuid; begin a:=private.request_delivery('aaaaaaaa-5100-4000-8000-000000000001',(select id from public.cypher_evidence_packages limit 1),'deliver-verified'); b:=private.request_delivery('aaaaaaaa-5100-4000-8000-000000000001',(select id from public.cypher_evidence_packages limit 1),'deliver-verified'); if a<>b or (select count(*) from public.cypher_deliveries where idempotency_key='deliver-verified')<>1 or (select count(*) from public.cypher_outbox where topic='destination_delivery' and idempotency_key='deliver-verified')<>1 or not exists(select 1 from public.cypher_deliveries d join public.cypher_evidence_packages p on (p.tenant_id,p.id,p.package_hash)=(d.tenant_id,d.evidence_package_id,d.source_hash) where d.id=a) then raise exception 'request not atomic/idempotent/bound'; end if; end $$;
select pass('request RPC derives source hash and atomically emits one delivery and outbox row');
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; begin perform private.record_delivery_attempt(d,'missing','delivered','dest-missing'); raise exception 'missing receipt delivered'; exception when raise_exception then if sqlerrm='missing receipt delivered' then raise; end if; end; if exists(select 1 from public.cypher_delivery_attempts where delivery_id=d) then raise exception 'missing receipt left attempt'; end if; end $$;
reset role; set role service_role;
insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,observed_hash,verification_state,receipt,observed_at) select gen_random_uuid(),tenant_id,id,'dest-bad',repeat('0',64),'observed_digest','{"provider":"fixture"}',now() from public.cypher_deliveries where idempotency_key='deliver-verified';
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; begin perform private.record_delivery_attempt(d,'mismatch','delivered','dest-bad'); raise exception 'mismatch delivered'; exception when raise_exception then if sqlerrm='mismatch delivered' then raise; end if; end; end $$;
select pass('missing and mismatched trusted destination digests cannot verify delivery');
reset role; set role service_role;
insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,observed_hash,verification_state,receipt,observed_at) select gen_random_uuid(),d.tenant_id,d.id,'dest-good',d.source_hash,'observed_digest','{"provider":"fixture"}',now() from public.cypher_deliveries d where idempotency_key='deliver-verified';
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; perform private.record_delivery_attempt(d,'verified','delivered','dest-good'); if not exists(select 1 from public.cypher_deliveries where id=d and status='delivered' and verified_hash=source_hash and verified_at is not null) then raise exception 'valid digest not verified'; end if; end $$;
select pass('matching service-only destination digest produces verified terminal delivery');
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; begin perform private.record_delivery_attempt(d,'verified','failed','dest-good'); raise exception 'mismatched replay accepted'; exception when raise_exception then if sqlerrm='mismatched replay accepted' then raise; end if; end; end $$;
select pass('same attempt key with changed canonical inputs is an idempotency conflict');
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; begin perform private.record_delivery_attempt(d,'terminal-new','failed'); raise exception 'new terminal attempt accepted'; exception when raise_exception then if sqlerrm='new terminal attempt accepted' then raise; end if; end; end $$;
select pass('new attempt after verified terminal remains rejected');
select private.request_delivery('aaaaaaaa-5100-4000-8000-000000000001',(select id from public.cypher_evidence_packages limit 1),'deliver-no-digest');
reset role; set role service_role;
insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,verification_state,receipt,observed_at) select gen_random_uuid(),tenant_id,id,'dest-no-digest','no_digest','{"provider":"fixture"}',now() from public.cypher_deliveries where idempotency_key='deliver-no-digest';
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-no-digest'; perform private.record_delivery_attempt(d,'no-digest','delivered','dest-no-digest'); if not exists(select 1 from public.cypher_deliveries where id=d and status='delivered_unverified' and verified_hash is null and verified_at is null) then raise exception 'no-digest delivery falsely verified'; end if; end $$;
select pass('destination without digest remains delivered_unverified');
select private.request_delivery('aaaaaaaa-5100-4000-8000-000000000001',(select id from public.cypher_evidence_packages limit 1),'deliver-revoked-between');
select private.revoke_connector('aaaaaaaa-5100-4000-8000-000000000001');
do $$ declare d uuid; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-revoked-between'; if (select status from public.cypher_deliveries where id=d)<>'revoked' then raise exception 'pending delivery not revoked'; end if; begin perform private.record_delivery_attempt(d,'after-revoke','failed'); raise exception 'revoked connector attempted'; exception when raise_exception then if sqlerrm='revoked connector attempted' then raise; end if; end; end $$;
select pass('connector revocation between request and attempt blocks execution');
do $$ declare d uuid; expected text; replay text; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-verified'; select receipt->>'sha256' into expected from public.cypher_delivery_attempts where delivery_id=d and receipt->>'attempt_key'='verified'; replay:=private.record_delivery_attempt(d,'verified','delivered','dest-good'); if replay is distinct from expected then raise exception 'verified replay changed'; end if; end $$;
select pass('lost-response replay after verified delivery returns identical immutable receipt even after connector revocation');
do $$ declare d uuid; expected text; replay text; begin select id into d from public.cypher_deliveries where idempotency_key='deliver-no-digest'; select receipt->>'sha256' into expected from public.cypher_delivery_attempts where delivery_id=d and receipt->>'attempt_key'='no-digest'; replay:=private.record_delivery_attempt(d,'no-digest','delivered','dest-no-digest'); if replay is distinct from expected then raise exception 'unverified replay changed'; end if; end $$;
select pass('lost-response replay after delivered_unverified returns identical immutable receipt even after connector revocation');

reset role;
delete from public.cypher_tenants where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$ begin if exists(select 1 from public.cypher_documents where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') or exists(select 1 from public.cypher_evidence_packages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') or exists(select 1 from public.cypher_delivery_attempts where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'cascade residue'; end if; end $$;
select pass('tenant cascade removes append-only evidence and delivery graph safely');
delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
select pass('suite leaves dependency-safe repeatable fixture state');
select * from finish();
