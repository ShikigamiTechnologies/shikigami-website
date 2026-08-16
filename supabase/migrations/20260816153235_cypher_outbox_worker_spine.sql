-- Server-only, lease-based Supabase outbox worker spine. Browser clients can
-- request work but cannot claim, complete, retry, or fail jobs.
create or replace function private.cypher_require_service_role()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'service role required';
  end if;
end $$;

create or replace function private.cypher_claim_outbox(batch_size integer default 5)
returns setof public.cypher_outbox
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cypher_require_service_role();
  if batch_size < 1 or batch_size > 25 then raise exception 'invalid batch size'; end if;
  return query
  with candidates as (
    select id from public.cypher_outbox
    where status in ('pending','retrying') and available_at <= now()
    order by created_at, id
    for update skip locked
    limit batch_size
  )
  update public.cypher_outbox o
  set status='processing', attempt_count=o.attempt_count+1, last_error=null
  from candidates c where o.id=c.id
  returning o.*;
end $$;

create or replace function private.cypher_complete_outbox(target_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.cypher_require_service_role();
  update public.cypher_outbox set status='completed',completed_at=now(),last_error=null
  where id=target_job and status='processing';
  if not found then raise exception 'processing job required'; end if;
end $$;

create or replace function private.cypher_fail_outbox(target_job uuid, failure text, maximum_attempts integer default 3)
returns text language plpgsql security definer set search_path = '' as $$
declare next_status text;
begin
  perform private.cypher_require_service_role();
  if maximum_attempts < 1 or maximum_attempts > 10 then raise exception 'invalid retry limit'; end if;
  select case when attempt_count >= maximum_attempts then 'failed' else 'retrying' end
  into next_status from public.cypher_outbox where id=target_job and status='processing' for update;
  if next_status is null then raise exception 'processing job required'; end if;
  update public.cypher_outbox set status=next_status,last_error=left(coalesce(failure,'worker failure'),1000),
    available_at=case when next_status='retrying' then now()+make_interval(secs=>least(300,15*power(2,greatest(attempt_count-1,0))::integer)) else available_at end
  where id=target_job;
  return next_status;
end $$;

create or replace function public.cypher_claim_outbox(batch_size integer default 5)
returns setof public.cypher_outbox language sql security invoker set search_path=''
as $$ select * from private.cypher_claim_outbox(batch_size) $$;
create or replace function public.cypher_complete_outbox(target_job uuid)
returns void language sql security invoker set search_path=''
as $$ select private.cypher_complete_outbox(target_job) $$;
create or replace function public.cypher_fail_outbox(target_job uuid, failure text, maximum_attempts integer default 3)
returns text language sql security invoker set search_path=''
as $$ select private.cypher_fail_outbox(target_job,failure,maximum_attempts) $$;

revoke all on function private.cypher_require_service_role() from public,anon,authenticated;
revoke all on function private.cypher_claim_outbox(integer) from public,anon,authenticated;
revoke all on function private.cypher_complete_outbox(uuid) from public,anon,authenticated;
revoke all on function private.cypher_fail_outbox(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.cypher_claim_outbox(integer) from public,anon,authenticated;
revoke all on function public.cypher_complete_outbox(uuid) from public,anon,authenticated;
revoke all on function public.cypher_fail_outbox(uuid,text,integer) from public,anon,authenticated;
grant execute on function private.cypher_require_service_role(),private.cypher_claim_outbox(integer),private.cypher_complete_outbox(uuid),private.cypher_fail_outbox(uuid,text,integer) to service_role;
grant execute on function public.cypher_claim_outbox(integer),public.cypher_complete_outbox(uuid),public.cypher_fail_outbox(uuid,text,integer) to service_role;

create or replace function private.cypher_run_extraction(target_document uuid, extracted_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.cypher_documents;r uuid:=gen_random_uuid();k text;v jsonb;
begin
  perform private.cypher_require_service_role();
  select * into d from public.cypher_documents where id=target_document for update;
  if d.id is null then raise exception 'document not found'; end if;
  insert into public.cypher_extraction_runs(id,tenant_id,document_id,version,provider,model_version,language,latency_ms,cost_micros)
  values(r,d.tenant_id,d.id,coalesce((select max(version)+1 from public.cypher_extraction_runs where document_id=d.id),1),'synthetic-staging-worker','outbox-v1','bilingual',1,0);
  for k,v in select * from jsonb_each(coalesce(extracted_fields,'{}'::jsonb)) loop
    insert into public.cypher_extraction_fields(id,tenant_id,extraction_id,field_key,normalized_value,provider_confidence,page_number)
    values(gen_random_uuid(),d.tenant_id,r,k,v,.99,1);
  end loop;
  update public.cypher_documents set status='needs_review' where id=d.id;
  return r;
end $$;
