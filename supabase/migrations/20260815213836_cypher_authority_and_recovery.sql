create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.cypher_tenants (id uuid primary key, legacy_id text not null unique, name text not null, created_at timestamptz not null default now());
create table public.cypher_memberships (tenant_id uuid not null references public.cypher_tenants(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null check (role in ('owner','operator','viewer')), primary key (tenant_id,user_id));
create table public.cypher_documents (id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade, legacy_id text not null, document_type text not null, original_path text not null unique, original_hash text not null check (original_hash ~ '^[0-9a-f]{64}$'), evidence_hash text check (evidence_hash is null or evidence_hash ~ '^[0-9a-f]{64}$'), validated boolean not null default false, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique (tenant_id,legacy_id), unique (tenant_id,id), check (not validated or evidence_hash is not null));
create table public.cypher_artifacts (id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade, document_id uuid not null, legacy_id text not null, artifact_type text not null check (artifact_type in ('original','evidence_manifest')), object_path text not null unique, content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'), size_bytes bigint not null check (size_bytes >= 0), created_at timestamptz not null default now(), unique (tenant_id,legacy_id), foreign key (tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade);
create table public.cypher_validations (id uuid primary key, tenant_id uuid not null references public.cypher_tenants(id) on delete cascade, document_id uuid not null, legacy_id text not null, decision text not null check (decision in ('approved','rejected','needs_resolution')), evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[0-9a-f]{64}$'), validator_user_id uuid not null references auth.users(id), validated_at timestamptz not null, unique (tenant_id,legacy_id), foreign key (tenant_id,document_id) references public.cypher_documents(tenant_id,id) on delete cascade);
create table public.cypher_migration_receipts (source_system text not null, source_id text not null, target_table text not null, target_id uuid not null, source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'), migrated_at timestamptz not null default now(), primary key (source_system,source_id,target_table));

create index cypher_memberships_user_tenant_idx on public.cypher_memberships(user_id,tenant_id);
create index cypher_documents_tenant_idx on public.cypher_documents(tenant_id);
create index cypher_artifacts_tenant_document_idx on public.cypher_artifacts(tenant_id,document_id);
create index cypher_validations_tenant_document_idx on public.cypher_validations(tenant_id,document_id);

alter table public.cypher_tenants enable row level security;
alter table public.cypher_memberships enable row level security;
alter table public.cypher_documents enable row level security;
alter table public.cypher_artifacts enable row level security;
alter table public.cypher_validations enable row level security;
alter table public.cypher_migration_receipts enable row level security;

create or replace function private.active_session() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from auth.sessions s where s.id = nullif(auth.jwt()->>'session_id','')::uuid and s.user_id = (select auth.uid())); $$;
revoke all on function private.active_session() from public, anon;
grant execute on function private.active_session() to authenticated;
create or replace function private.is_member(target_tenant uuid) returns boolean language sql stable security definer set search_path = '' as $$ select private.active_session() and exists (select 1 from public.cypher_memberships m where m.tenant_id = target_tenant and m.user_id = (select auth.uid())); $$;
revoke all on function private.is_member(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
create or replace function private.has_write_role(target_tenant uuid) returns boolean language sql stable security definer set search_path = '' as $$ select private.active_session() and exists (select 1 from public.cypher_memberships m where m.tenant_id = target_tenant and m.user_id = (select auth.uid()) and m.role in ('owner','operator')); $$;
revoke all on function private.has_write_role(uuid) from public, anon;
grant execute on function private.has_write_role(uuid) to authenticated;

create policy tenant_select on public.cypher_tenants for select to authenticated using (private.is_member(id));
create policy membership_select on public.cypher_memberships for select to authenticated using (user_id = (select auth.uid()) and private.active_session());
create policy documents_select on public.cypher_documents for select to authenticated using (private.is_member(tenant_id));
create policy documents_insert on public.cypher_documents for insert to authenticated with check (private.has_write_role(tenant_id) and created_by = (select auth.uid()));
create policy artifacts_select on public.cypher_artifacts for select to authenticated using (private.is_member(tenant_id));
create policy artifacts_insert on public.cypher_artifacts for insert to authenticated with check (private.has_write_role(tenant_id));
create policy validations_select on public.cypher_validations for select to authenticated using (private.is_member(tenant_id));
create policy validations_insert on public.cypher_validations for insert to authenticated with check (private.has_write_role(tenant_id) and validator_user_id = (select auth.uid()));
create policy receipts_select on public.cypher_migration_receipts for select to authenticated using (
  (target_table = 'cypher_documents' and exists (select 1 from public.cypher_documents d where d.id = target_id and private.is_member(d.tenant_id)))
  or (target_table = 'cypher_artifacts' and exists (select 1 from public.cypher_artifacts a where a.id = target_id and private.is_member(a.tenant_id)))
  or (target_table = 'cypher_validations' and exists (select 1 from public.cypher_validations v where v.id = target_id and private.is_member(v.tenant_id)))
);

grant usage on schema public to authenticated;
grant select on public.cypher_tenants, public.cypher_memberships to authenticated;
grant select,insert on public.cypher_documents, public.cypher_artifacts, public.cypher_validations to authenticated;
grant select on public.cypher_migration_receipts to authenticated;
revoke all on all tables in schema public from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('cypher-documents','cypher-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/tiff','text/plain','application/json']) on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy cypher_storage_select on storage.objects for select to authenticated using (bucket_id='cypher-documents' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and private.is_member(((storage.foldername(name))[1])::uuid));
create policy cypher_storage_insert on storage.objects for insert to authenticated with check (bucket_id='cypher-documents' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and private.has_write_role(((storage.foldername(name))[1])::uuid));

create or replace function private.guard_document_integrity() returns trigger language plpgsql set search_path = '' as $$ begin if new.original_hash <> old.original_hash or new.original_path <> old.original_path then raise exception 'immutable original'; end if; return new; end; $$;
create trigger cypher_document_integrity before update on public.cypher_documents for each row execute function private.guard_document_integrity();
