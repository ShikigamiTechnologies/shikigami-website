\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
insert into auth.sessions(id,user_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222');

insert into public.cypher_tenants(id,legacy_id,name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tenant-a','Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','tenant-b','Tenant B');
insert into public.cypher_memberships(tenant_id,user_id,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','viewer');

set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}',false);
insert into public.cypher_documents(id,tenant_id,legacy_id,document_type,original_path,original_hash,created_by)
values ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','doc-a','invoice','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/doc-a/original.pdf',repeat('a',64),'11111111-1111-4111-8111-111111111111');

do $$
begin
  begin
    insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes)
    values ('bbbbbbbb-1000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-1000-4000-8000-000000000001','cross-tenant','original','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cross/original.pdf',repeat('b',64),10);
    raise exception 'cross-tenant artifact relation was accepted';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-0000-4000-8000-000000000002"}',false);
do $$
begin
  begin
    insert into public.cypher_documents(id,tenant_id,legacy_id,document_type,original_path,original_hash,created_by)
    values ('bbbbbbbb-1000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','viewer-doc','invoice','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/viewer/original.pdf',repeat('c',64),'22222222-2222-4222-8222-222222222222');
    raise exception 'viewer document insertion was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  begin
    insert into public.cypher_artifacts(id,tenant_id,document_id,legacy_id,artifact_type,object_path,content_hash,size_bytes)
    values ('bbbbbbbb-1000-4000-8000-000000000003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-1000-4000-8000-000000000001','fk-cross-tenant','original','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/fk-cross/original.pdf',repeat('d',64),10);
    raise exception 'composite tenant/document foreign key was not enforced';
  exception when foreign_key_violation then null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='cypher-documents' and public=false and 'application/pdf'=any(allowed_mime_types)
  ) then raise exception 'private PDF storage configuration missing';
  end if;
end $$;

select 'cypher_authority_adversarial_passed' as result;
