begin;

update storage.buckets set allowed_mime_types=array[
  'application/pdf','image/jpeg','image/png','image/tiff','text/plain','text/csv',
  'application/json','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] where id='cypher-documents';

create or replace function private.cypher_register_generated_evidence(target_document uuid,generated jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.cypher_documents;v public.cypher_validations;a jsonb;aid uuid;manifest uuid;pdf uuid;package uuid:=gen_random_uuid();result jsonb:='[]'::jsonb;
begin
  perform private.cypher_require_service_role();
  select * into d from public.cypher_documents where id=target_document;
  select * into v from public.cypher_validations where document_id=target_document order by validated_at desc limit 1;
  if d.id is null or v.id is null or d.status<>'validated' or not d.validated then raise exception 'validated document required';end if;
  for a in select * from jsonb_array_elements(generated) loop
    aid=(a->>'id')::uuid;
    insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes) values(aid,d.tenant_id,d.id,'worker-'||aid,a->>'type',a->>'path',a->>'hash',(a->>'size')::bigint);
    insert into public.cypher_storage_receipts(id,tenant_id,document_id,artifact_id,object_path,content_hash,size_bytes,verification_method,verified_at) values(gen_random_uuid(),d.tenant_id,d.id,aid,a->>'path',a->>'hash',(a->>'size')::bigint,'storage_api_head_sha256',now());
    if a->>'type'='evidence_manifest' then manifest=aid;elsif a->>'type'='validation_pdf' then pdf=aid;else insert into public.cypher_export_jobs(id,tenant_id,format,status,artifact_id,idempotency_key,created_by) values(gen_random_uuid(),d.tenant_id,replace(a->>'type','export_',''),'completed',aid,'worker-'||aid,v.validator_user_id);end if;
    result=result||jsonb_build_object('id',aid,'type',a->>'type','path',a->>'path');
  end loop;
  insert into public.cypher_evidence_packages(id,tenant_id,document_id,validation_id,version,schema_version,source_hash,manifest_artifact_id,pdf_artifact_id,package_hash) values(package,d.tenant_id,d.id,v.id,coalesce((select max(version)+1 from public.cypher_evidence_packages where tenant_id=d.tenant_id and document_id=d.id),1),'worker-v1',d.original_hash,manifest,pdf,(select content_hash from public.cypher_artifacts where id=manifest));
  return jsonb_build_object('package',package,'artifacts',result);
end $$;
revoke all on function private.cypher_register_generated_evidence(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.cypher_register_generated_evidence(uuid,jsonb) to service_role;
create or replace function public.cypher_register_generated_evidence(target_document uuid,generated jsonb)
returns jsonb language sql security invoker set search_path=''
as $$select private.cypher_register_generated_evidence(target_document,generated)$$;
revoke all on function public.cypher_register_generated_evidence(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cypher_register_generated_evidence(uuid,jsonb) to service_role;

create or replace function private.cypher_request_delivery(target_connector uuid,target_package uuid,request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cypher_connectors;p public.cypher_evidence_packages;result uuid;existing public.cypher_deliveries;
begin
  if request_key is null or btrim(request_key)='' then raise exception 'delivery idempotency key required';end if;
  select * into c from public.cypher_connectors where id=target_connector and status='active' and revoked_at is null;
  select * into p from public.cypher_evidence_packages where id=target_package;
  if c.id is null or p.id is null or c.tenant_id<>p.tenant_id or not private.has_write_role(c.tenant_id) then raise exception 'delivery access denied';end if;
  select * into existing from public.cypher_deliveries where tenant_id=c.tenant_id and idempotency_key=request_key;
  if existing.id is not null then
    if existing.connector_id<>c.id or existing.evidence_package_id<>p.id then raise exception 'delivery idempotency key conflict';end if;
    return existing.id;
  end if;
  result:=gen_random_uuid();
  insert into public.cypher_deliveries(id,tenant_id,connector_id,evidence_package_id,idempotency_key,status,source_hash,requested_by) values(result,c.tenant_id,c.id,p.id,request_key,'pending',p.package_hash,auth.uid());
  insert into public.cypher_outbox(id,tenant_id,topic,aggregate_id,idempotency_key,payload) values(gen_random_uuid(),c.tenant_id,'destination_delivery',result,request_key,jsonb_build_object('delivery_id',result,'evidence_package_id',p.id,'source_hash',p.package_hash));
  return result;
end $$;
revoke all on function private.cypher_request_delivery(uuid,uuid,text) from public,anon;
grant execute on function private.cypher_request_delivery(uuid,uuid,text) to authenticated;

create or replace function private.cypher_execute_simulated_delivery(target_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.cypher_deliveries;destination text;receipt_hash text;receipt_body jsonb;
begin
  perform private.cypher_require_service_role();
  select dl.* into d from public.cypher_deliveries dl join public.cypher_connectors c on (c.tenant_id,c.id)=(dl.tenant_id,dl.connector_id) join public.cypher_evidence_packages p on (p.tenant_id,p.id,p.package_hash)=(dl.tenant_id,dl.evidence_package_id,dl.source_hash) where dl.id=target_delivery and c.connector_type='simulated' and c.status='active' and c.revoked_at is null for update of dl;
  if d.id is null then raise exception 'simulated delivery not found or forbidden';end if;
  if d.status='delivered' then return jsonb_build_object('delivery',d.id,'destination',d.destination_object_id,'receipt_hash',d.verified_hash,'replayed',true);end if;
  if d.status not in ('pending','retrying','processing') then raise exception 'delivery not executable';end if;
  destination='local://cypher/'||d.id;
  receipt_hash=encode(extensions.digest(convert_to(d.id::text||':'||destination||':'||d.source_hash,'UTF8'),'sha256'),'hex');
  receipt_body=jsonb_build_object('schema','cypher-simulated-delivery/v1','delivery_id',d.id,'destination_id',destination,'source_hash',d.source_hash,'sha256',receipt_hash,'outcome','delivered');
  insert into public.cypher_destination_receipts(id,tenant_id,delivery_id,destination_object_id,observed_hash,verification_state,receipt,observed_at) values(gen_random_uuid(),d.tenant_id,d.id,destination,d.source_hash,'observed_digest',receipt_body,now()) on conflict(tenant_id,delivery_id,destination_object_id) do nothing;
  insert into public.cypher_delivery_attempts(id,tenant_id,delivery_id,attempt_number,status,receipt,completed_at) values(gen_random_uuid(),d.tenant_id,d.id,1,'delivered',receipt_body,now()) on conflict(tenant_id,delivery_id,attempt_number) do nothing;
  update public.cypher_deliveries set status='delivered',destination_object_id=destination,attempt_count=1,verified_hash=d.source_hash,delivered_at=now(),verified_at=now(),last_error=null where id=d.id;
  return jsonb_build_object('delivery',d.id,'destination',destination,'receipt_hash',receipt_hash,'replayed',false);
end $$;
revoke all on function private.cypher_execute_simulated_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function private.cypher_execute_simulated_delivery(uuid) to service_role;

create or replace function public.cypher_execute_simulated_delivery(target_delivery uuid)
returns jsonb language sql security invoker set search_path=''
as $$select private.cypher_execute_simulated_delivery(target_delivery)$$;
revoke all on function public.cypher_execute_simulated_delivery(uuid) from public,anon,authenticated;
grant execute on function public.cypher_execute_simulated_delivery(uuid) to service_role;

create or replace function private.cypher_request_evidence(target_document uuid, request_key text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.cypher_documents;
  result uuid;
begin
  if request_key is null or btrim(request_key) = '' then raise exception 'evidence idempotency key required'; end if;
  select * into d from public.cypher_documents
    where id=target_document and status='validated' and validated and private.has_write_role(tenant_id);
  if d.id is null then raise exception 'validated document not found or forbidden'; end if;
  select id into result from public.cypher_outbox
    where tenant_id=d.tenant_id and topic='evidence' and idempotency_key=request_key;
  if result is not null then
    if not exists(select 1 from public.cypher_outbox where id=result and aggregate_id=d.id) then raise exception 'evidence idempotency key conflict'; end if;
    return result;
  end if;
  result:=gen_random_uuid();
  insert into public.cypher_outbox(id,tenant_id,topic,aggregate_id,idempotency_key,payload)
    values(result,d.tenant_id,'evidence',d.id,request_key,jsonb_build_object('document_id',d.id));
  return result;
end $$;

revoke all on function private.cypher_request_evidence(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.cypher_request_evidence(uuid,text) to authenticated,service_role;

create or replace function public.cypher_request_evidence(target_document uuid, request_key text)
returns uuid language sql security invoker set search_path=''
as $$ select private.cypher_request_evidence(target_document,request_key) $$;
revoke all on function public.cypher_request_evidence(uuid,text) from public,anon;
grant execute on function public.cypher_request_evidence(uuid,text) to authenticated,service_role;

commit;
