-- Batch C service transaction. Storage bytes are verified via the official API
-- before this function; this transaction binds the observation and finalizes it.
alter table public.cypher_trusted_upload_receipts
  add column if not exists storage_version text not null default 'legacy';

-- Even service_role must use the guarded transaction below.  SECURITY DEFINER
-- executes as the function owner, so revoking these grants closes the bypass
-- without preventing the function from inserting its immutable receipt.
revoke insert, update, delete on public.cypher_trusted_upload_receipts from service_role;

drop policy if exists cypher_storage_insert on storage.objects;
create policy cypher_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='cypher-documents'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/original/[0-9a-f]{64}\.[a-z0-9]+$'
  and private.has_write_role(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.cypher_upload_intents i
    where i.tenant_id=((storage.foldername(name))[1])::uuid
      and i.id=((storage.foldername(name))[2])::uuid
      and i.state='awaiting_upload'
  )
);

create or replace function private.cypher_commit_verified_upload(
  target_tenant uuid, target_intent uuid, target_document uuid,
  target_path text, target_hash text, target_size bigint, target_storage_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.cypher_upload_intents; prior public.cypher_trusted_upload_receipts; receipt_id uuid:=gen_random_uuid(); begin
  if auth.role()<>'service_role' then raise exception 'service role required'; end if;
  if target_hash !~ '^[0-9a-f]{64}$' or target_storage_version is null or btrim(target_storage_version)='' then raise exception 'verified observation required'; end if;
  select * into i from public.cypher_upload_intents where tenant_id=target_tenant and id=target_intent for update;
  if i.id is null or i.state<>'awaiting_upload' then raise exception 'awaiting upload intent required'; end if;
  if target_size<>i.requested_size then raise exception 'trusted receipt size mismatch'; end if;
  if target_path !~ ('^'||target_tenant::text||'/'||target_intent::text||'/original/[0-9a-f]{64}\.[a-z0-9]+$')
     or split_part(split_part(target_path,'/',4),'.',1)<>target_hash
  then raise exception 'trusted canonical object path required'; end if;
  select * into prior from public.cypher_trusted_upload_receipts where tenant_id=target_tenant and upload_intent_id=target_intent;
  if prior.id is not null then
    if (prior.document_id,prior.object_path,prior.content_hash,prior.size_bytes,prior.storage_version) is distinct from (target_document,target_path,target_hash,target_size,target_storage_version) then raise exception 'trusted receipt idempotency conflict'; end if;
    return prior.document_id;
  end if;
  insert into public.cypher_trusted_upload_receipts(id,tenant_id,upload_intent_id,document_id,object_path,content_hash,size_bytes,storage_version,verification_method,verified_at)
  values(receipt_id,target_tenant,target_intent,target_document,target_path,target_hash,target_size,target_storage_version,'storage_api_head_streamed_sha256',now());
  -- Same transaction: document, audit and outbox creation either all commit or all roll back.
  return private.cypher_finalize_verified_upload(receipt_id);
end $$;
revoke all on function private.cypher_commit_verified_upload(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function private.cypher_commit_verified_upload(uuid,uuid,uuid,text,text,bigint,text) to service_role;
