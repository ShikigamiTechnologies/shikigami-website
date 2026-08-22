-- Minimal authenticated transition spine used by the real Worker pilot.
create or replace function public.cypher_validate_document(target_document uuid, decision text, notes text, corrected_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.cypher_documents; run_id uuid; k text; v jsonb; validation_id uuid:=gen_random_uuid(); manifest_hash text;
begin
 select * into d from public.cypher_documents where id=target_document for update;
 if d.id is null or not private.has_write_role(d.tenant_id) then raise exception 'document access denied'; end if;
 if decision not in ('approved','approved_with_variance','unmatched','rejected','needs_resolution') then raise exception 'invalid decision'; end if;
 select id into run_id from public.cypher_extraction_runs where tenant_id=d.tenant_id and document_id=d.id order by version desc limit 1;
 if run_id is null then raise exception 'extraction required'; end if;
 manifest_hash:=encode(extensions.digest(convert_to(jsonb_build_object('document',d.id,'decision',decision,'fields',coalesce(corrected_fields,'{}'::jsonb),'notes',notes)::text,'utf8'),'sha256'),'hex');
 insert into public.cypher_validations(id,tenant_id,document_id,legacy_id,decision,evidence_manifest_hash,validator_user_id,validated_at) values(validation_id,d.tenant_id,d.id,'pilot-'||validation_id,decision,manifest_hash,auth.uid(),now());
 for k,v in select * from jsonb_each(coalesce(corrected_fields,'{}'::jsonb)) loop insert into public.cypher_corrections(id,tenant_id,document_id,extraction_id,field_key,prior_value,corrected_value,corrected_by,reason) values(gen_random_uuid(),d.tenant_id,d.id,run_id,k,null,v,auth.uid(),notes); end loop;
 update public.cypher_documents set status=case when decision in ('approved','approved_with_variance') then 'validated' when decision='rejected' then 'rejected' else 'needs_review' end,validated=decision in ('approved','approved_with_variance'),evidence_hash=case when decision in ('approved','approved_with_variance') then manifest_hash else evidence_hash end,validation_version=validation_version+1 where id=d.id;
 return validation_id;
end $$;

create or replace function public.cypher_transition_relationship(target uuid, decision text, reason text)
returns uuid language plpgsql security definer set search_path='' as $$ declare r public.cypher_relationships; begin select * into r from public.cypher_relationships where id=target for update; if r.id is null or not private.has_write_role(r.tenant_id) then raise exception 'relationship access denied'; end if; if decision not in ('confirmed','dismissed','resolved') then raise exception 'invalid decision'; end if; update public.cypher_relationships set status=decision,decided_by=auth.uid(),decided_at=now() where id=target; insert into public.cypher_relationship_decisions values(gen_random_uuid(),r.tenant_id,r.id,decision,auth.uid(),coalesce(reason,'pilot'),now()); return r.id; end $$;

create or replace function public.cypher_transition_exception(target uuid,next_state text,reason text,assignee uuid)
returns uuid language plpgsql security definer set search_path='' as $$ declare e public.cypher_exceptions; begin select * into e from public.cypher_exceptions where id=target for update; if e.id is null or not private.has_write_role(e.tenant_id) then raise exception 'exception access denied'; end if; if next_state not in ('open','acknowledged','resolved','dismissed') then raise exception 'invalid state'; end if; update public.cypher_exceptions set status=next_state,assigned_to=assignee,resolution=reason,decided_by=auth.uid(),updated_at=now() where id=target; insert into public.cypher_exception_events values(gen_random_uuid(),e.tenant_id,e.id,next_state,auth.uid(),jsonb_build_object('from',e.status,'to',next_state,'reason',reason),now()); return e.id; end $$;

create or replace function public.cypher_transition_obligation(target uuid,next_state text,reason text)
returns uuid language plpgsql security definer set search_path='' as $$ declare o public.cypher_obligations; begin select * into o from public.cypher_obligations where id=target for update; if o.id is null or not private.has_write_role(o.tenant_id) then raise exception 'obligation access denied'; end if; if next_state not in ('unconfirmed','confirmed_outstanding','disputed','overdue','cleared') then raise exception 'invalid state'; end if; update public.cypher_obligations set state=next_state,updated_at=now() where id=target; insert into public.cypher_obligation_events values(gen_random_uuid(),o.tenant_id,o.id,o.state,next_state,auth.uid(),coalesce(reason,'pilot'),now()); return o.id; end $$;

create or replace function public.cypher_request_delivery(target_connector uuid,target_package uuid,request_key text)
returns uuid language plpgsql security definer set search_path='' as $$ declare c public.cypher_connectors;p public.cypher_evidence_packages;result uuid; begin select * into c from public.cypher_connectors where id=target_connector;select * into p from public.cypher_evidence_packages where id=target_package;if c.id is null or p.id is null or c.tenant_id<>p.tenant_id or not private.has_write_role(c.tenant_id) then raise exception 'delivery access denied';end if;insert into public.cypher_deliveries(id,tenant_id,connector_id,evidence_package_id,idempotency_key,status,source_hash,requested_by) values(gen_random_uuid(),c.tenant_id,c.id,p.id,request_key,'pending',p.package_hash,auth.uid()) on conflict(tenant_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into result;return result;end $$;

grant execute on function public.cypher_validate_document(uuid,text,text,jsonb),public.cypher_transition_relationship(uuid,text,text),public.cypher_transition_exception(uuid,text,text,uuid),public.cypher_transition_obligation(uuid,text,text),public.cypher_request_delivery(uuid,uuid,text) to authenticated;

drop function if exists public.cypher_complete_customer_upload(uuid,uuid,uuid,text,text,bigint,text);
create or replace function public.cypher_commit_verified_upload(target_tenant uuid,target_intent uuid,target_document uuid,target_path text,target_hash text,target_size bigint,target_storage_version text)
returns uuid language sql security invoker set search_path='' as $$ select private.cypher_commit_verified_upload(target_tenant,target_intent,target_document,target_path,target_hash,target_size,target_storage_version) $$;
revoke all on function public.cypher_commit_verified_upload(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.cypher_commit_verified_upload(uuid,uuid,uuid,text,text,bigint,text) to service_role;

create or replace function public.cypher_run_extraction(target_document uuid, extracted_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$ declare d public.cypher_documents;r uuid:=gen_random_uuid();k text;v jsonb;begin select * into d from public.cypher_documents where id=target_document for update;if d.id is null or not private.has_write_role(d.tenant_id) then raise exception 'document access denied';end if;insert into public.cypher_extraction_runs(id,tenant_id,document_id,version,provider,model_version,language,latency_ms,cost_micros) values(r,d.tenant_id,d.id,coalesce((select max(version)+1 from public.cypher_extraction_runs where document_id=d.id),1),'local-worker-ocr','batch-d-v1','bilingual',1,0);for k,v in select * from jsonb_each(coalesce(extracted_fields,'{}')) loop insert into public.cypher_extraction_fields(id,tenant_id,extraction_id,field_key,normalized_value,provider_confidence,page_number) values(gen_random_uuid(),d.tenant_id,r,k,v,.99,1);end loop;update public.cypher_documents set status='needs_review' where id=d.id;return r;end $$;

create or replace function public.cypher_register_generated_evidence(target_document uuid,generated jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d public.cypher_documents;v public.cypher_validations;a jsonb;aid uuid;manifest uuid;pdf uuid;package uuid:=gen_random_uuid();result jsonb:='[]'::jsonb;begin select * into d from public.cypher_documents where id=target_document;select * into v from public.cypher_validations where document_id=target_document order by validated_at desc limit 1;if d.id is null or v.id is null or not private.has_write_role(d.tenant_id) then raise exception 'validated document required';end if;for a in select * from jsonb_array_elements(generated) loop aid=(a->>'id')::uuid;insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes) values(aid,d.tenant_id,d.id,'worker-'||aid,a->>'type',a->>'path',a->>'hash',(a->>'size')::bigint);insert into public.cypher_storage_receipts(id,tenant_id,document_id,artifact_id,object_path,content_hash,size_bytes,verification_method,verified_at) values(gen_random_uuid(),d.tenant_id,d.id,aid,a->>'path',a->>'hash',(a->>'size')::bigint,'storage_api_head_sha256',now());if a->>'type'='evidence_manifest' then manifest=aid;elsif a->>'type'='validation_pdf' then pdf=aid;else insert into public.cypher_export_jobs(id,tenant_id,format,status,artifact_id,idempotency_key,created_by) values(gen_random_uuid(),d.tenant_id,replace(a->>'type','export_',''),'completed',aid,'worker-'||aid,auth.uid());end if;result=result||jsonb_build_object('id',aid,'type',a->>'type','path',a->>'path');end loop;insert into public.cypher_evidence_packages(id,tenant_id,document_id,validation_id,version,schema_version,source_hash,manifest_artifact_id,pdf_artifact_id,package_hash) values(package,d.tenant_id,d.id,v.id,1,'worker-v1',d.original_hash,manifest,pdf,(select content_hash from public.cypher_artifacts where id=manifest));return jsonb_build_object('package',package,'artifacts',result);end $$;

create or replace function public.cypher_execute_local_delivery(target_connector uuid,target_package uuid,request_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ declare delivery uuid:=gen_random_uuid();hash text;tenant uuid;destination text;receipt_hash text;begin select p.package_hash,p.tenant_id into hash,tenant from public.cypher_evidence_packages p join public.cypher_connectors c on c.tenant_id=p.tenant_id where p.id=target_package and c.id=target_connector and c.status='active';if tenant is null or not private.has_write_role(tenant) then raise exception 'approved evidence package not found or forbidden';end if;insert into public.cypher_deliveries(id,tenant_id,connector_id,evidence_package_id,idempotency_key,status,source_hash,requested_by) values(delivery,tenant,target_connector,target_package,request_key,'pending',hash,auth.uid());destination='local://cypher/'||delivery;insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,observed_hash,verification_state,receipt,observed_at) values(gen_random_uuid(),tenant,delivery,destination,hash,'observed_digest',jsonb_build_object('emulator','local','transport','memory'),now());receipt_hash=private.record_delivery_attempt(delivery,'worker-'||delivery,'delivered',destination);return jsonb_build_object('delivery',delivery,'destination',destination,'receipt_hash',receipt_hash);end $$;

drop policy if exists cypher_storage_artifact_insert on storage.objects;
create policy cypher_storage_artifact_insert on storage.objects for insert to authenticated with check(bucket_id='cypher-documents' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and private.has_write_role(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]='artifacts');

create table if not exists public.cypher_storage_verification_failures(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.cypher_tenants(id),upload_intent_id uuid not null references public.cypher_upload_intents(id),object_path text not null,reason text not null,cleanup_delete_status integer,cleanup_head_status integer,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

-- Fail closed at the RPC boundary. PostgreSQL grants function execution to
-- PUBLIC by default, which would otherwise expose SECURITY DEFINER entry
-- points through PostgREST even when their internal authorization rejects the
-- request.
revoke all on function public.cypher_validate_document(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.cypher_transition_relationship(uuid,text,text) from public, anon, authenticated;
revoke all on function public.cypher_transition_exception(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.cypher_transition_obligation(uuid,text,text) from public, anon, authenticated;
revoke all on function public.cypher_request_delivery(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.cypher_run_extraction(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.cypher_register_generated_evidence(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.cypher_execute_local_delivery(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.cypher_validate_document(uuid,text,text,jsonb) to authenticated;
grant execute on function public.cypher_transition_relationship(uuid,text,text) to authenticated;
grant execute on function public.cypher_transition_exception(uuid,text,text,uuid) to authenticated;
grant execute on function public.cypher_transition_obligation(uuid,text,text) to authenticated;
grant execute on function public.cypher_request_delivery(uuid,uuid,text) to authenticated;
grant execute on function public.cypher_run_extraction(uuid,jsonb) to service_role;
grant execute on function public.cypher_register_generated_evidence(uuid,jsonb) to service_role;
grant execute on function public.cypher_execute_local_delivery(uuid,uuid,text) to service_role;
alter table public.cypher_storage_verification_failures enable row level security;
revoke all on public.cypher_storage_verification_failures from public,anon,authenticated;
grant insert,select on public.cypher_storage_verification_failures to service_role;
grant execute on function public.cypher_run_extraction(uuid,jsonb),public.cypher_register_generated_evidence(uuid,jsonb),public.cypher_execute_local_delivery(uuid,uuid,text) to service_role;
