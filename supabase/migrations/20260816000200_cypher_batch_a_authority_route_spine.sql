-- Batch A: public intake creates only an untrusted, bounded upload intent.
alter table public.cypher_memberships add column if not exists status text not null default 'active'
  check(status in ('active','inactive'));
create or replace function private.is_member(target_tenant uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.active_session() and exists(select 1 from public.cypher_memberships m where m.tenant_id=target_tenant and m.user_id=(select auth.uid()) and m.status='active') $$;
create or replace function private.has_write_role(target_tenant uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.active_session() and exists(select 1 from public.cypher_memberships m where m.tenant_id=target_tenant and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','operator')) $$;

alter table public.cypher_documents add column if not exists display_filename text;
alter table public.cypher_documents add column if not exists upload_verification_state text not null default 'verified'
  check(upload_verification_state in ('verified','rejected'));

create table public.cypher_upload_intents (
  id uuid primary key,
  tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  location_id uuid,
  display_filename text not null check(length(display_filename) between 1 and 240),
  document_type text not null check(document_type in ('invoice','purchase_order','receipt','other')),
  requested_size bigint not null check(requested_size between 1 and 15728640),
  state text not null default 'awaiting_upload' check(state in ('awaiting_upload','finalized','rejected')),
  idempotency_key text not null check(length(idempotency_key) between 8 and 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(tenant_id,id), unique(tenant_id,idempotency_key),
  foreign key(tenant_id,location_id) references public.cypher_locations(tenant_id,id)
);

-- Batch C alone writes this immutable, service-only receipt after checking the
-- object with Storage HEAD plus streamed SHA-256. Authenticated callers cannot.
create table public.cypher_trusted_upload_receipts (
  id uuid primary key,
  tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  upload_intent_id uuid not null,
  document_id uuid not null,
  object_path text not null unique,
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check(size_bytes between 1 and 15728640),
  verification_method text not null check(verification_method='storage_api_head_streamed_sha256'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(tenant_id,upload_intent_id), unique(tenant_id,document_id),
  foreign key(tenant_id,upload_intent_id) references public.cypher_upload_intents(tenant_id,id)
);

create table public.cypher_intake_events (
  id uuid primary key,
  tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  document_id uuid not null,
  upload_intent_id uuid not null,
  event_type text not null check(event_type='intake_verified'),
  actor_user_id uuid not null references auth.users(id),
  detail jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(tenant_id,upload_intent_id) references public.cypher_upload_intents(tenant_id,id)
);

alter table public.cypher_upload_intents enable row level security;
alter table public.cypher_trusted_upload_receipts enable row level security;
alter table public.cypher_intake_events enable row level security;
revoke all on public.cypher_upload_intents,public.cypher_trusted_upload_receipts,public.cypher_intake_events from public,anon,authenticated;
grant select on public.cypher_upload_intents,public.cypher_trusted_upload_receipts,public.cypher_intake_events to authenticated;
grant insert,update,delete on public.cypher_trusted_upload_receipts to service_role;
grant select on public.cypher_upload_intents to service_role;
grant select on public.cypher_documents to service_role;
create policy upload_intents_select on public.cypher_upload_intents for select to authenticated using(private.is_member(tenant_id));
create policy trusted_upload_receipts_select on public.cypher_trusted_upload_receipts for select to authenticated using(private.is_member(tenant_id));
create policy intake_events_select on public.cypher_intake_events for select to authenticated using(private.is_member(tenant_id));

create or replace function public.cypher_create_upload_intent(target_tenant uuid,target_location uuid,target_filename text,target_document_type text,requested_size bigint,request_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.cypher_upload_intents; intent_id uuid:=gen_random_uuid(); begin
if actor is null or not private.has_write_role(target_tenant) then raise exception 'tenant write authorization required'; end if;
if request_key is null or length(request_key) not between 8 and 200 then raise exception 'valid idempotency key required'; end if;
if requested_size not between 1 and 15728640 then raise exception 'bounded upload required'; end if;
if target_document_type not in ('invoice','purchase_order','receipt','other') then raise exception 'invalid document type'; end if;
if target_location is not null and not exists(select 1 from public.cypher_locations where tenant_id=target_tenant and id=target_location) then raise exception 'location not found or forbidden'; end if;
select * into existing from public.cypher_upload_intents where tenant_id=target_tenant and idempotency_key=request_key;
if existing.id is not null then
  if existing.requested_size<>requested_size or existing.document_type<>target_document_type or existing.display_filename<>left(target_filename,240) then raise exception 'upload intent idempotency conflict'; end if;
  return jsonb_build_object('id',existing.id,'state',existing.state,'replayed',true);
end if;
insert into public.cypher_upload_intents(id,tenant_id,location_id,display_filename,document_type,requested_size,idempotency_key,created_by)
values(intent_id,target_tenant,target_location,left(target_filename,240),target_document_type,requested_size,request_key,actor);
return jsonb_build_object('id',intent_id,'state','awaiting_upload','replayed',false); end $$;
revoke all on function public.cypher_create_upload_intent(uuid,uuid,text,text,bigint,text) from public,anon;
grant execute on function public.cypher_create_upload_intent(uuid,uuid,text,text,bigint,text) to authenticated;

-- Receipt rows are immutable. Finalization is atomic and derives every trusted
-- document/audit/outbox field from one tenant/intent/document/path/hash/size-bound receipt.
create or replace function private.cypher_finalize_verified_upload(target_receipt uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.cypher_trusted_upload_receipts; i public.cypher_upload_intents; begin
if auth.role()<>'service_role' then raise exception 'service role required'; end if;
select * into r from public.cypher_trusted_upload_receipts where id=target_receipt for update;
if r.id is null then raise exception 'trusted upload receipt required'; end if;
select * into i from public.cypher_upload_intents where tenant_id=r.tenant_id and id=r.upload_intent_id for update;
if i.id is null or i.state<>'awaiting_upload' then raise exception 'awaiting upload intent required'; end if;
if r.size_bytes<>i.requested_size then raise exception 'trusted receipt size mismatch'; end if;
insert into public.cypher_documents(id,tenant_id,legacy_id,document_type,original_path,original_hash,created_by,status,mime_type,size_bytes,idempotency_key,location_id,display_filename,upload_verification_state)
values(r.document_id,r.tenant_id,'batch-a:'||r.document_id,i.document_type,r.object_path,r.content_hash,i.created_by,'quarantined','application/pdf',r.size_bytes,i.idempotency_key,i.location_id,i.display_filename,'verified');
insert into public.cypher_intake_events(id,tenant_id,document_id,upload_intent_id,event_type,actor_user_id,detail)
values(gen_random_uuid(),r.tenant_id,r.document_id,i.id,'intake_verified',i.created_by,jsonb_build_object('receipt_id',r.id,'path',r.object_path,'hash',r.content_hash,'size',r.size_bytes));
insert into public.cypher_outbox(id,tenant_id,topic,aggregate_id,idempotency_key,payload)
values(gen_random_uuid(),r.tenant_id,'extract',r.document_id,i.idempotency_key,jsonb_build_object('document_id',r.document_id,'receipt_id',r.id));
update public.cypher_upload_intents set state='finalized',finalized_at=now() where id=i.id;
return r.document_id; end $$;
revoke all on function private.cypher_finalize_verified_upload(uuid) from public,anon,authenticated;
grant execute on function private.cypher_finalize_verified_upload(uuid) to service_role;
grant usage on schema private to service_role;

create or replace function private.reject_trusted_upload_receipt_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'trusted upload receipts are immutable'; end $$;
create trigger trusted_upload_receipts_immutable before update or delete on public.cypher_trusted_upload_receipts for each row execute function private.reject_trusted_upload_receipt_mutation();

-- Existing route wrappers, now tenant-explicit where a command is not already document-bound.
create or replace function public.cypher_request_export(target_tenant uuid,export_format text,request_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid(); begin if not private.has_write_role(target_tenant) then raise exception 'tenant write authorization required'; end if;
if export_format not in ('csv','xlsx','json') or request_key is null or btrim(request_key)='' then raise exception 'invalid export request'; end if;
insert into public.cypher_export_jobs(id,tenant_id,format,idempotency_key,created_by) values(result,target_tenant,export_format,request_key,auth.uid()) on conflict(tenant_id,idempotency_key) do nothing returning id into result;
if result is null then select id into result from public.cypher_export_jobs where tenant_id=target_tenant and idempotency_key=request_key and format=export_format; end if; return result; end $$;
revoke all on function public.cypher_request_export(uuid,text,text) from public,anon;
grant execute on function public.cypher_request_export(uuid,text,text) to authenticated;
