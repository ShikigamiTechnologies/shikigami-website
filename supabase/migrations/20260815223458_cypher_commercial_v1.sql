-- Cypher commercial v1: Supabase is the sole mutable authority.
-- Object bytes are written through the Storage API; SQL records only immutable receipts.
create extension if not exists pgcrypto;

alter table public.cypher_artifacts drop constraint if exists cypher_artifacts_artifact_type_check;
alter table public.cypher_artifacts add constraint cypher_artifacts_artifact_type_check
  check (artifact_type in ('original','extraction','validation_pdf','evidence_manifest','export_csv','export_xlsx','export_json'));
alter table public.cypher_validations drop constraint if exists cypher_validations_decision_check;
alter table public.cypher_validations add constraint cypher_validations_decision_check
  check (decision in ('approved','approved_with_variance','unmatched','rejected','needs_resolution'));
alter table public.cypher_documents add column if not exists status text not null default 'quarantined'
  check (status in ('quarantined','accepted','extracting','needs_review','validated','rejected','cancelled'));
alter table public.cypher_documents add column if not exists mime_type text not null default 'application/pdf';
alter table public.cypher_documents add column if not exists size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 15728640);
alter table public.cypher_documents add column if not exists idempotency_key text;
alter table public.cypher_documents add column if not exists quarantine_reason text;
alter table public.cypher_documents add column if not exists validation_version integer not null default 0 check (validation_version >= 0);
create unique index if not exists cypher_documents_intake_idempotency on public.cypher_documents(tenant_id,idempotency_key) where idempotency_key is not null;

create table public.cypher_locations (
  id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  code text not null, display_name text not null, aliases text[] not null default '{}',
  created_at timestamptz not null default now(), unique(tenant_id,id), unique(tenant_id,code)
);
create table public.cypher_vendors (
  id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  legal_name text not null, vendor_number text, aliases text[] not null default '{}', payment_terms_days integer check(payment_terms_days between 0 and 365),
  created_at timestamptz not null default now(), unique(tenant_id,id), unique nulls not distinct(tenant_id,vendor_number)
);
alter table public.cypher_documents add column if not exists location_id uuid;
alter table public.cypher_documents add column if not exists vendor_id uuid;
alter table public.cypher_documents add constraint cypher_documents_location_fk foreign key(tenant_id,location_id) references public.cypher_locations(tenant_id,id);
alter table public.cypher_documents add constraint cypher_documents_vendor_fk foreign key(tenant_id,vendor_id) references public.cypher_vendors(tenant_id,id);

create table public.cypher_quarantine_scans (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, scanner text not null,
  status text not null check(status in ('pending','clean','blocked','error')), findings jsonb not null default '{}', scanned_at timestamptz,
  unique(tenant_id,document_id,scanner), foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade
);
create table public.cypher_outbox (
  id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  topic text not null check(topic in ('extract','evidence','export','destination_delivery','aging')),
  aggregate_id uuid not null, idempotency_key text not null, payload jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','completed','retrying','cancelled','failed')),
  attempt_count integer not null default 0 check(attempt_count >= 0), available_at timestamptz not null default now(),
  last_error text, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(tenant_id,topic,idempotency_key), unique(tenant_id,id)
);
create table public.cypher_extraction_runs (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, version integer not null check(version > 0),
  provider text not null, model_version text not null, language text not null check(language in ('en','es','bilingual')),
  raw_artifact_id uuid, latency_ms integer check(latency_ms >= 0), cost_micros bigint check(cost_micros >= 0), created_at timestamptz not null default now(),
  unique(tenant_id,document_id,version), unique(tenant_id,id),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(raw_artifact_id) references public.cypher_artifacts(id)
);
create table public.cypher_extraction_fields (
  id uuid primary key, tenant_id uuid not null, extraction_id uuid not null, field_key text not null,
  normalized_value jsonb, provider_confidence numeric check(provider_confidence between 0 and 1), page_number integer check(page_number > 0),
  bounding_box jsonb, text_span jsonb, created_at timestamptz not null default now(),
  unique(tenant_id,extraction_id,field_key), foreign key(tenant_id,extraction_id) references public.cypher_extraction_runs(tenant_id,id) on delete cascade
);
create table public.cypher_corrections (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, extraction_id uuid not null,
  field_key text not null, prior_value jsonb, corrected_value jsonb not null, corrected_by uuid not null references auth.users(id),
  reason text, created_at timestamptz not null default now(),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(tenant_id,extraction_id) references public.cypher_extraction_runs(tenant_id,id)
);
create table public.cypher_relationships (
  id uuid primary key, tenant_id uuid not null, source_document_id uuid not null, related_document_id uuid not null,
  relationship_type text not null check(relationship_type in ('po_match','duplicate_invoice','reused_po','supporting_document')),
  detector_version text not null, explanation jsonb not null, status text not null default 'candidate' check(status in ('candidate','confirmed','dismissed','resolved')),
  decided_by uuid references auth.users(id), decided_at timestamptz, created_at timestamptz not null default now(),
  check(source_document_id <> related_document_id), unique(tenant_id,source_document_id,related_document_id,relationship_type,detector_version),
  foreign key(tenant_id,source_document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(tenant_id,related_document_id) references public.cypher_documents(tenant_id,id) on delete cascade
);
create table public.cypher_exceptions (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, kind text not null,
  status text not null default 'open' check(status in ('open','acknowledged','resolved','dismissed')),
  assigned_to uuid references auth.users(id), resolution text, decided_by uuid references auth.users(id),
  due_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,id), foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade
);
create table public.cypher_exception_events (
  id uuid primary key, tenant_id uuid not null, exception_id uuid not null, event_type text not null,
  actor_user_id uuid not null references auth.users(id), detail jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(tenant_id,exception_id) references public.cypher_exceptions(tenant_id,id) on delete cascade
);
create table public.cypher_obligations (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, vendor_id uuid,
  state text not null default 'unconfirmed' check(state in ('unconfirmed','confirmed_outstanding','disputed','overdue','cleared')),
  amount_minor bigint not null default 0 check(amount_minor >= 0), currency text not null default 'USD', due_at date,
  confirmed_by uuid references auth.users(id), confirmed_at timestamptz, policy_version text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id,document_id),
  check(state in ('unconfirmed','disputed','cleared') or (confirmed_by is not null and confirmed_at is not null)),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(tenant_id,vendor_id) references public.cypher_vendors(tenant_id,id)
);
create table public.cypher_evidence_packages (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, validation_id uuid not null,
  version integer not null check(version > 0), schema_version text not null, source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  manifest_artifact_id uuid not null references public.cypher_artifacts(id), pdf_artifact_id uuid not null references public.cypher_artifacts(id),
  package_hash text not null check(package_hash ~ '^[0-9a-f]{64}$'), finalized_at timestamptz not null default now(),
  unique(tenant_id,document_id,version), unique(tenant_id,id),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(validation_id) references public.cypher_validations(id)
);
create table public.cypher_export_jobs (
  id uuid primary key, tenant_id uuid not null, format text not null check(format in ('csv','xlsx','json')),
  status text not null default 'pending' check(status in ('pending','completed','failed','cancelled')),
  artifact_id uuid references public.cypher_artifacts(id), idempotency_key text not null, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), unique(tenant_id,idempotency_key)
);
create table public.cypher_connectors (
  id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade,
  connector_type text not null check(connector_type in ('simulated')), display_name text not null,
  status text not null default 'active' check(status in ('active','revoked')), revoked_at timestamptz, created_at timestamptz not null default now(),
  unique(tenant_id,id)
);
create table public.cypher_deliveries (
  id uuid primary key, tenant_id uuid not null, connector_id uuid not null, evidence_package_id uuid not null,
  idempotency_key text not null, status text not null default 'pending' check(status in ('pending','processing','delivered','retrying','failed','cancelled','revoked')),
  destination_object_id text, attempt_count integer not null default 0, source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  verified_hash text check(verified_hash is null or verified_hash ~ '^[0-9a-f]{64}$'), last_error text,
  requested_by uuid not null references auth.users(id), requested_at timestamptz not null default now(), delivered_at timestamptz, verified_at timestamptz,
  unique(tenant_id,idempotency_key), unique(tenant_id,id),
  foreign key(tenant_id,connector_id) references public.cypher_connectors(tenant_id,id) on delete cascade,
  foreign key(tenant_id,evidence_package_id) references public.cypher_evidence_packages(tenant_id,id) on delete cascade
);
create table public.cypher_delivery_attempts (
  id uuid primary key, tenant_id uuid not null, delivery_id uuid not null, attempt_number integer not null check(attempt_number > 0),
  status text not null check(status in ('started','delivered','failed','cancelled','revoked')),
  receipt jsonb not null default '{}', created_at timestamptz not null default now(), completed_at timestamptz,
  unique(tenant_id,delivery_id,attempt_number), foreign key(tenant_id,delivery_id) references public.cypher_deliveries(tenant_id,id) on delete cascade
);
alter table public.cypher_deliveries drop constraint cypher_deliveries_status_check;
alter table public.cypher_deliveries add constraint cypher_deliveries_status_check
  check(status in ('pending','processing','awaiting_verification','delivered_unverified','delivered','retrying','failed','cancelled','revoked'));
create table public.cypher_destination_receipts (
  id uuid primary key, tenant_id uuid not null, delivery_id uuid not null, destination_object_id text not null check(btrim(destination_object_id)<>''),
  observed_hash text check(observed_hash is null or observed_hash ~ '^[0-9a-f]{64}$'),
  verification_state text not null check(verification_state in ('observed_digest','no_digest')),
  receipt jsonb not null default '{}', observed_at timestamptz not null,
  check((verification_state='observed_digest' and observed_hash is not null) or (verification_state='no_digest' and observed_hash is null)),
  unique(tenant_id,delivery_id,destination_object_id),
  foreign key(tenant_id,delivery_id) references public.cypher_deliveries(tenant_id,id) on delete cascade
);

-- All public tables are RLS-protected and explicitly opted into the Data API only for authenticated users.
do $$ declare t text; begin
  foreach t in array array['cypher_locations','cypher_vendors','cypher_quarantine_scans','cypher_outbox','cypher_extraction_runs','cypher_extraction_fields','cypher_corrections','cypher_relationships','cypher_exceptions','cypher_exception_events','cypher_obligations','cypher_evidence_packages','cypher_export_jobs','cypher_connectors','cypher_deliveries','cypher_delivery_attempts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(tenant_id))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_write_role(tenant_id))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_write_role(tenant_id)) with check (private.has_write_role(tenant_id))',t||'_update',t);
  end loop;
end $$;

-- Originals are never moved, updated or deleted; only SELECT and first INSERT are allowed through Storage API.
drop policy if exists cypher_storage_insert on storage.objects;
create policy cypher_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='cypher-documents' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.has_write_role(((storage.foldername(name))[1])::uuid)
  and name ~ '/original/[0-9a-f]{64}\\.[a-z0-9]+$'
);

-- Repair pass: tenant-safe evidence references and service-verified object receipts.
alter table public.cypher_artifacts add constraint cypher_artifacts_tenant_id_unique unique(tenant_id,id);
alter table public.cypher_artifacts add constraint cypher_artifacts_tenant_document_id_unique unique(tenant_id,document_id,id);
alter table public.cypher_validations add constraint cypher_validations_tenant_id_unique unique(tenant_id,id);
alter table public.cypher_extraction_runs add constraint cypher_extraction_runs_tenant_document_id_unique unique(tenant_id,document_id,id);
alter table public.cypher_extraction_runs drop constraint cypher_extraction_runs_raw_artifact_id_fkey;
alter table public.cypher_extraction_runs add constraint cypher_extraction_runs_raw_artifact_fk foreign key(tenant_id,raw_artifact_id) references public.cypher_artifacts(tenant_id,id);
alter table public.cypher_corrections drop constraint cypher_corrections_tenant_id_extraction_id_fkey;
alter table public.cypher_corrections add constraint cypher_corrections_extraction_document_fk foreign key(tenant_id,document_id,extraction_id) references public.cypher_extraction_runs(tenant_id,document_id,id);
alter table public.cypher_evidence_packages drop constraint cypher_evidence_packages_validation_id_fkey;
alter table public.cypher_evidence_packages drop constraint cypher_evidence_packages_manifest_artifact_id_fkey;
alter table public.cypher_evidence_packages drop constraint cypher_evidence_packages_pdf_artifact_id_fkey;
alter table public.cypher_evidence_packages add constraint cypher_evidence_packages_validation_fk foreign key(tenant_id,validation_id) references public.cypher_validations(tenant_id,id) on delete cascade;
alter table public.cypher_evidence_packages add constraint cypher_evidence_packages_manifest_fk foreign key(tenant_id,manifest_artifact_id) references public.cypher_artifacts(tenant_id,id) on delete cascade;
alter table public.cypher_evidence_packages add constraint cypher_evidence_packages_pdf_fk foreign key(tenant_id,pdf_artifact_id) references public.cypher_artifacts(tenant_id,id) on delete cascade;
alter table public.cypher_export_jobs add constraint cypher_export_jobs_tenant_id_unique unique(tenant_id,id);
alter table public.cypher_export_jobs drop constraint cypher_export_jobs_artifact_id_fkey;
alter table public.cypher_export_jobs add constraint cypher_export_jobs_artifact_fk foreign key(tenant_id,artifact_id) references public.cypher_artifacts(tenant_id,id);

create table public.cypher_storage_receipts (
  id uuid primary key, tenant_id uuid not null, document_id uuid not null, artifact_id uuid not null,
  object_path text not null, content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), size_bytes bigint not null check(size_bytes > 0),
  verification_method text not null check(verification_method in ('storage_api_head_sha256')), verified_at timestamptz not null,
  unique(tenant_id,artifact_id), unique(tenant_id,object_path),
  foreign key(tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade,
  foreign key(tenant_id,document_id,artifact_id) references public.cypher_artifacts(tenant_id,document_id,id) on delete cascade
);

alter table public.cypher_obligations add constraint cypher_obligations_tenant_id_unique unique(tenant_id,id);
create table public.cypher_obligation_events (
  id uuid primary key, tenant_id uuid not null, obligation_id uuid not null, from_state text not null, to_state text not null,
  actor_user_id uuid not null references auth.users(id), reason text not null, created_at timestamptz not null default now(),
  foreign key(tenant_id,obligation_id) references public.cypher_obligations(tenant_id,id) on delete cascade
);
alter table public.cypher_relationships add constraint cypher_relationships_tenant_id_unique unique(tenant_id,id);
create table public.cypher_relationship_decisions (
  id uuid primary key, tenant_id uuid not null, relationship_id uuid not null, decision text not null check(decision in ('confirmed','dismissed','resolved')),
  actor_user_id uuid not null references auth.users(id), reason text not null, created_at timestamptz not null default now(),
  foreign key(tenant_id,relationship_id) references public.cypher_relationships(tenant_id,id) on delete cascade
);
alter table public.cypher_relationships add constraint cypher_relationships_explanation_object check(jsonb_typeof(explanation)='object' and explanation ? 'rule' and explanation ? 'facts');
alter table public.cypher_exception_events add constraint cypher_exception_events_type_check check(event_type in ('created','assigned','acknowledged','resolved','dismissed','reopened'));

-- Replace the blanket grants/policies with explicit least privilege. Lifecycle tables mutate only through guarded RPCs.
do $$ declare t text; begin
  foreach t in array array['cypher_locations','cypher_vendors','cypher_quarantine_scans','cypher_outbox','cypher_extraction_runs','cypher_extraction_fields','cypher_corrections','cypher_relationships','cypher_relationship_decisions','cypher_exceptions','cypher_exception_events','cypher_obligations','cypher_obligation_events','cypher_evidence_packages','cypher_export_jobs','cypher_connectors','cypher_deliveries','cypher_delivery_attempts','cypher_destination_receipts','cypher_storage_receipts'] loop
    execute format('drop policy if exists %I on public.%I',t||'_select',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('revoke all on public.%I from authenticated,anon',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(tenant_id))',t||'_select',t);
  end loop;
end $$;
grant insert on public.cypher_locations,public.cypher_vendors,public.cypher_quarantine_scans,public.cypher_outbox,public.cypher_extraction_runs,public.cypher_extraction_fields,public.cypher_corrections,public.cypher_relationships,public.cypher_exceptions,public.cypher_obligations,public.cypher_export_jobs,public.cypher_connectors to authenticated;
create policy cypher_locations_insert on public.cypher_locations for insert to authenticated with check(private.has_write_role(tenant_id));
create policy cypher_vendors_insert on public.cypher_vendors for insert to authenticated with check(private.has_write_role(tenant_id));
create policy cypher_quarantine_scans_insert on public.cypher_quarantine_scans for insert to authenticated with check(private.has_write_role(tenant_id));
create policy cypher_outbox_insert on public.cypher_outbox for insert to authenticated with check(private.has_write_role(tenant_id));
create policy cypher_extraction_runs_insert on public.cypher_extraction_runs for insert to authenticated with check(private.has_write_role(tenant_id));
create policy cypher_extraction_fields_insert on public.cypher_extraction_fields for insert to authenticated with check(private.has_write_role(tenant_id) and page_number is not null and bounding_box is not null and text_span is not null and jsonb_typeof(bounding_box) in ('array','object') and jsonb_typeof(text_span) in ('array','object'));
create policy cypher_corrections_insert on public.cypher_corrections for insert to authenticated with check(private.has_write_role(tenant_id) and corrected_by=(select auth.uid()));
create policy cypher_relationships_insert on public.cypher_relationships for insert to authenticated with check(private.has_write_role(tenant_id) and status='candidate' and decided_by is null and decided_at is null);
create policy cypher_exceptions_insert on public.cypher_exceptions for insert to authenticated with check(private.has_write_role(tenant_id) and status='open' and decided_by is null);
create policy cypher_obligations_insert on public.cypher_obligations for insert to authenticated with check(private.has_write_role(tenant_id) and state='unconfirmed' and confirmed_by is null and confirmed_at is null);
create policy cypher_export_jobs_insert on public.cypher_export_jobs for insert to authenticated with check(private.has_write_role(tenant_id) and created_by=(select auth.uid()) and status='pending' and artifact_id is null);
create policy cypher_connectors_insert on public.cypher_connectors for insert to authenticated with check(private.has_write_role(tenant_id) and status='active' and revoked_at is null);
revoke all on public.cypher_destination_receipts from public,anon,authenticated;
grant select on public.cypher_destination_receipts to authenticated;
grant select on public.cypher_deliveries to service_role;
grant insert on public.cypher_destination_receipts to service_role;

create or replace function private.reject_mutation() returns trigger language plpgsql set search_path='' as $$ begin if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if; raise exception 'append-only relation'; end $$;
do $$ declare t text; begin
  foreach t in array array['cypher_extraction_runs','cypher_extraction_fields','cypher_corrections','cypher_relationship_decisions','cypher_exception_events','cypher_obligation_events','cypher_evidence_packages','cypher_delivery_attempts','cypher_destination_receipts','cypher_storage_receipts'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.reject_mutation()',t||'_immutable',t);
  end loop;
end $$;

create or replace function private.transition_obligation(target uuid, next_state text, transition_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.cypher_obligations; begin
  select * into o from public.cypher_obligations where id=target and private.has_write_role(tenant_id) for update;
  if o.id is null then raise exception 'obligation not found or forbidden'; end if;
  if next_state not in ('confirmed_outstanding','disputed','cleared') then raise exception 'invalid obligation transition'; end if;
  if o.state='unconfirmed' and next_state not in ('confirmed_outstanding','disputed') then raise exception 'unconfirmed cannot become debt or clear'; end if;
  if o.state='cleared' then raise exception 'terminal obligation'; end if;
  update public.cypher_obligations set state=next_state, confirmed_by=case when next_state='confirmed_outstanding' then auth.uid() else confirmed_by end, confirmed_at=case when next_state='confirmed_outstanding' then now() else confirmed_at end, updated_at=now() where id=o.id;
  insert into public.cypher_obligation_events(id,tenant_id,obligation_id,from_state,to_state,actor_user_id,reason) values(gen_random_uuid(),o.tenant_id,o.id,o.state,next_state,auth.uid(),transition_reason);
end $$;
revoke all on function private.transition_obligation(uuid,text,text) from public,anon; grant execute on function private.transition_obligation(uuid,text,text) to authenticated;

create or replace function private.transition_exception(target uuid, next_status text, transition_reason text, assignee uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.cypher_exceptions; begin select * into e from public.cypher_exceptions where id=target and private.has_write_role(tenant_id) for update;
if e.id is null then raise exception 'exception not found or forbidden'; end if;
if next_status not in ('acknowledged','resolved','dismissed') or e.status in ('resolved','dismissed') then raise exception 'invalid exception transition'; end if;
update public.cypher_exceptions set status=next_status,assigned_to=coalesce(assignee,assigned_to),resolution=case when next_status in ('resolved','dismissed') then transition_reason else resolution end,decided_by=case when next_status in ('resolved','dismissed') then auth.uid() else decided_by end,updated_at=now() where id=e.id;
insert into public.cypher_exception_events(id,tenant_id,exception_id,event_type,actor_user_id,detail) values(gen_random_uuid(),e.tenant_id,e.id,next_status,auth.uid(),jsonb_build_object('reason',transition_reason,'assignee',assignee)); end $$;
revoke all on function private.transition_exception(uuid,text,text,uuid) from public,anon; grant execute on function private.transition_exception(uuid,text,text,uuid) to authenticated;

create or replace function private.transition_relationship(target uuid, next_status text, transition_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.cypher_relationships; begin
select * into r from public.cypher_relationships where id=target and private.has_write_role(tenant_id) for update;
if r.id is null then raise exception 'relationship not found or forbidden'; end if;
if next_status not in ('confirmed','dismissed','resolved') or r.status <> 'candidate' then raise exception 'invalid or terminal relationship transition'; end if;
if transition_reason is null or btrim(transition_reason)='' then raise exception 'relationship reason required'; end if;
update public.cypher_relationships set status=next_status,decided_by=auth.uid(),decided_at=now() where id=r.id and tenant_id=r.tenant_id;
insert into public.cypher_relationship_decisions(id,tenant_id,relationship_id,decision,actor_user_id,reason) values(gen_random_uuid(),r.tenant_id,r.id,next_status,auth.uid(),transition_reason);
end $$;
revoke all on function private.transition_relationship(uuid,text,text) from public,anon; grant execute on function private.transition_relationship(uuid,text,text) to authenticated;

create or replace function private.cancel_delivery(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.cypher_deliveries; begin select * into d from public.cypher_deliveries where id=target and private.has_write_role(tenant_id) for update;
if d.id is null then raise exception 'delivery not found or forbidden'; end if; if d.status not in ('pending','retrying') then raise exception 'delivery terminal or active'; end if;
update public.cypher_deliveries set status='cancelled' where id=d.id; end $$;
create or replace function private.request_delivery(target_connector uuid, target_package uuid, request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.cypher_evidence_packages; delivery_id uuid; begin
if request_key is null or btrim(request_key)='' then raise exception 'delivery idempotency key required'; end if;
select ep.* into p from public.cypher_evidence_packages ep join public.cypher_documents d on (d.tenant_id,d.id)=(ep.tenant_id,ep.document_id) join public.cypher_validations v on (v.tenant_id,v.id)=(ep.tenant_id,ep.validation_id) where ep.id=target_package and d.validated and d.status='validated' and d.evidence_hash=ep.package_hash and v.decision in ('approved','approved_with_variance') and private.has_write_role(ep.tenant_id);
if p.id is null then raise exception 'approved evidence package not found or forbidden'; end if;
if not exists(select 1 from public.cypher_connectors c where c.id=target_connector and c.tenant_id=p.tenant_id and c.status='active' and c.revoked_at is null) then raise exception 'active connector required'; end if;
delivery_id:=gen_random_uuid();
insert into public.cypher_deliveries(id,tenant_id,connector_id,evidence_package_id,idempotency_key,source_hash,requested_by) values(delivery_id,p.tenant_id,target_connector,p.id,request_key,p.package_hash,auth.uid()) on conflict(tenant_id,idempotency_key) do nothing returning id into delivery_id;
if delivery_id is null then select id into delivery_id from public.cypher_deliveries where tenant_id=p.tenant_id and idempotency_key=request_key and connector_id=target_connector and evidence_package_id=p.id; if delivery_id is null then raise exception 'delivery idempotency key conflict'; end if; return delivery_id; end if;
insert into public.cypher_outbox(id,tenant_id,topic,aggregate_id,idempotency_key,payload) values(gen_random_uuid(),p.tenant_id,'destination_delivery',delivery_id,request_key,jsonb_build_object('delivery_id',delivery_id,'evidence_package_id',p.id,'source_hash',p.package_hash));
return delivery_id; end $$;
revoke all on function private.request_delivery(uuid,uuid,text) from public,anon; grant execute on function private.request_delivery(uuid,uuid,text) to authenticated;
create or replace function private.record_delivery_attempt(target uuid, attempt_key text, outcome text, destination_id text default null)
returns text language plpgsql security definer set search_path='' as $$
declare d public.cypher_deliveries; n integer; receipt_hash text; destination_hash text; destination_state text; prior_receipt jsonb; begin
if attempt_key is null or btrim(attempt_key)='' then raise exception 'attempt key required'; end if;
select dl.* into d from public.cypher_deliveries dl join public.cypher_evidence_packages ep on (ep.tenant_id,ep.id,ep.package_hash)=(dl.tenant_id,dl.evidence_package_id,dl.source_hash) where dl.id=target and private.has_write_role(dl.tenant_id) for update of dl;
if d.id is null then raise exception 'delivery, package, or source hash invalid'; end if;
select receipt into prior_receipt from public.cypher_delivery_attempts where tenant_id=d.tenant_id and delivery_id=d.id and receipt->>'attempt_key'=attempt_key;
if prior_receipt is not null then
  if prior_receipt->>'outcome' is distinct from outcome or prior_receipt->>'destination_id' is distinct from destination_id or prior_receipt->>'source_hash' is distinct from d.source_hash then raise exception 'attempt idempotency conflict'; end if;
  return prior_receipt->>'sha256';
end if;
if not exists(select 1 from public.cypher_connectors c where c.tenant_id=d.tenant_id and c.id=d.connector_id and c.status='active' and c.revoked_at is null) then raise exception 'active connector required'; end if;
if d.status in ('delivered','delivered_unverified','cancelled','revoked') then raise exception 'terminal delivery'; end if;
if outcome not in ('delivered','failed') then raise exception 'invalid outcome'; end if;
if outcome='delivered' and (destination_id is null or btrim(destination_id)='') then raise exception 'destination id required'; end if;
if outcome='delivered' then
  select observed_hash,verification_state into destination_hash,destination_state from public.cypher_destination_receipts where tenant_id=d.tenant_id and delivery_id=d.id and destination_object_id=destination_id;
  if destination_state is null then raise exception 'trusted destination receipt required'; end if;
  if destination_state='observed_digest' and destination_hash<>d.source_hash then raise exception 'destination digest mismatch'; end if;
end if;
-- PostgreSQL jsonb text is the receipt's canonical UTF-8 representation: sorted object keys, stable scalar rendering.
n:=d.attempt_count+1; receipt_hash:=encode(extensions.digest(convert_to(jsonb_build_object('attempt',n,'attempt_key',attempt_key,'delivery_id',d.id,'destination_id',destination_id,'outcome',outcome,'source_hash',d.source_hash)::text,'utf8'),'sha256'),'hex');
insert into public.cypher_delivery_attempts(id,tenant_id,delivery_id,attempt_number,status,receipt,completed_at) values(gen_random_uuid(),d.tenant_id,d.id,n,outcome,jsonb_build_object('attempt_key',attempt_key,'destination_id',destination_id,'outcome',outcome,'source_hash',d.source_hash,'sha256',receipt_hash),now());
update public.cypher_deliveries set attempt_count=n,status=case when outcome='failed' then 'retrying' when destination_state='observed_digest' then 'delivered' else 'delivered_unverified' end,verified_hash=case when destination_state='observed_digest' then destination_hash else null end,destination_object_id=case when outcome='delivered' then destination_id else destination_object_id end,delivered_at=case when outcome='delivered' then now() else null end,verified_at=case when destination_state='observed_digest' then now() else null end where id=d.id; return receipt_hash; end $$;
create or replace function private.revoke_connector(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.cypher_connectors; begin select * into c from public.cypher_connectors where id=target and private.has_write_role(tenant_id) for update;
if c.id is null then raise exception 'connector not found or forbidden'; end if; if c.status='revoked' then return; end if;
update public.cypher_connectors set status='revoked',revoked_at=now() where id=c.id;
update public.cypher_deliveries set status='revoked' where tenant_id=c.tenant_id and connector_id=c.id and status in ('pending','retrying'); end $$;
revoke all on function private.cancel_delivery(uuid),private.record_delivery_attempt(uuid,text,text,text),private.revoke_connector(uuid) from public,anon;
grant execute on function private.cancel_delivery(uuid),private.record_delivery_attempt(uuid,text,text,text),private.revoke_connector(uuid) to authenticated;
grant usage on schema private to authenticated;

-- Reinstall finalize with decision, state, tenant/document/hash, and Storage receipt verification gates.
create or replace function private.finalize_validation(target_document uuid, target_validation uuid, target_manifest uuid, target_pdf uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid; package_id uuid; next_version integer; source_hash text; source_path text; manifest_hash text; pdf_hash text; package_hash text; begin
select d.tenant_id,d.original_hash,d.original_path into tenant,source_hash,source_path from public.cypher_documents d where d.id=target_document and private.has_write_role(d.tenant_id) and d.status='needs_review' for update;
if tenant is null then raise exception 'document not reviewable or forbidden'; end if;
select a.content_hash into manifest_hash from public.cypher_artifacts a join public.cypher_storage_receipts r on (r.tenant_id,r.document_id,r.artifact_id)=(a.tenant_id,a.document_id,a.id) join public.cypher_validations v on (v.tenant_id,v.document_id,v.evidence_manifest_hash)=(a.tenant_id,a.document_id,a.content_hash) where v.id=target_validation and v.validator_user_id=auth.uid() and v.decision in ('approved','approved_with_variance') and a.id=target_manifest and a.tenant_id=tenant and a.document_id=target_document and a.artifact_type='evidence_manifest' and r.object_path=a.object_path and r.content_hash=a.content_hash;
if manifest_hash is null then raise exception 'approved validation or verified manifest missing'; end if;
select a.content_hash into pdf_hash from public.cypher_artifacts a join public.cypher_storage_receipts r on (r.tenant_id,r.document_id,r.artifact_id)=(a.tenant_id,a.document_id,a.id) where a.id=target_pdf and a.tenant_id=tenant and a.document_id=target_document and a.artifact_type='validation_pdf' and r.object_path=a.object_path and r.content_hash=a.content_hash;
if pdf_hash is null then raise exception 'verified pdf missing'; end if;
if not exists(select 1 from public.cypher_artifacts a join public.cypher_storage_receipts r on (r.tenant_id,r.artifact_id)=(a.tenant_id,a.id) where a.tenant_id=tenant and a.document_id=target_document and a.artifact_type='original' and a.object_path=source_path and a.content_hash=source_hash and r.object_path=source_path and r.content_hash=source_hash) then raise exception 'verified immutable original missing'; end if;
select coalesce(max(version),0)+1 into next_version from public.cypher_evidence_packages where tenant_id=tenant and document_id=target_document;
package_hash:=encode(extensions.digest(convert_to(jsonb_build_object('document_id',target_document,'manifest_artifact_id',target_manifest,'manifest_hash',manifest_hash,'pdf_artifact_id',target_pdf,'pdf_hash',pdf_hash,'schema','cypher-evidence/v1','source_hash',source_hash,'tenant_id',tenant,'validation_id',target_validation,'version',next_version)::text,'utf8'),'sha256'),'hex');
package_id:=gen_random_uuid(); insert into public.cypher_evidence_packages(id,tenant_id,document_id,validation_id,version,schema_version,source_hash,manifest_artifact_id,pdf_artifact_id,package_hash) values(package_id,tenant,target_document,target_validation,next_version,'cypher-evidence/v1',source_hash,target_manifest,target_pdf,package_hash);
update public.cypher_documents set validated=true,status='validated',evidence_hash=package_hash,validation_version=next_version where id=target_document and tenant_id=tenant; return package_id; end $$;
revoke all on function private.finalize_validation(uuid,uuid,uuid,uuid) from public,anon; grant execute on function private.finalize_validation(uuid,uuid,uuid,uuid) to authenticated;
