-- Keep privileged implementations out of the PostgREST-exposed public schema.
-- Public RPCs are SECURITY INVOKER wrappers; authorization remains inside the
-- implementation and role grants stay explicit.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

alter function public.cypher_create_upload_intent(uuid, uuid, text, text, bigint, text) set schema private;
alter function public.cypher_request_export(uuid, text, text) set schema private;
alter function public.cypher_validate_document(uuid, text, text, jsonb) set schema private;
alter function public.cypher_transition_relationship(uuid, text, text) set schema private;
alter function public.cypher_transition_exception(uuid, text, text, uuid) set schema private;
alter function public.cypher_transition_obligation(uuid, text, text) set schema private;
alter function public.cypher_request_delivery(uuid, uuid, text) set schema private;
alter function public.cypher_run_extraction(uuid, jsonb) set schema private;
alter function public.cypher_register_generated_evidence(uuid, jsonb) set schema private;
alter function public.cypher_execute_local_delivery(uuid, uuid, text) set schema private;

revoke all on function private.cypher_create_upload_intent(uuid, uuid, text, text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.cypher_request_export(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.cypher_validate_document(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.cypher_transition_relationship(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.cypher_transition_exception(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.cypher_transition_obligation(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.cypher_request_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.cypher_run_extraction(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.cypher_register_generated_evidence(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.cypher_execute_local_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;

grant execute on function private.cypher_create_upload_intent(uuid, uuid, text, text, bigint, text) to authenticated, service_role;
grant execute on function private.cypher_request_export(uuid, text, text) to authenticated, service_role;
grant execute on function private.cypher_validate_document(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function private.cypher_transition_relationship(uuid, text, text) to authenticated, service_role;
grant execute on function private.cypher_transition_exception(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function private.cypher_transition_obligation(uuid, text, text) to authenticated, service_role;
grant execute on function private.cypher_request_delivery(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.cypher_run_extraction(uuid, jsonb) to service_role;
grant execute on function private.cypher_register_generated_evidence(uuid, jsonb) to service_role;
grant execute on function private.cypher_execute_local_delivery(uuid, uuid, text) to service_role;

create function public.cypher_create_upload_intent(target_tenant uuid, target_location uuid, target_filename text, target_document_type text, requested_size bigint, request_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cypher_create_upload_intent(target_tenant, target_location, target_filename, target_document_type, requested_size, request_key) $$;

create function public.cypher_request_export(target_tenant uuid, export_format text, request_key text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_request_export(target_tenant, export_format, request_key) $$;

create function public.cypher_validate_document(target_document uuid, decision text, notes text, corrected_fields jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_validate_document(target_document, decision, notes, corrected_fields) $$;

create function public.cypher_transition_relationship(target uuid, decision text, reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_transition_relationship(target, decision, reason) $$;

create function public.cypher_transition_exception(target uuid, next_state text, reason text, assignee uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_transition_exception(target, next_state, reason, assignee) $$;

create function public.cypher_transition_obligation(target uuid, next_state text, reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_transition_obligation(target, next_state, reason) $$;

create function public.cypher_request_delivery(target_connector uuid, target_package uuid, request_key text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_request_delivery(target_connector, target_package, request_key) $$;

create function public.cypher_run_extraction(target_document uuid, extracted_fields jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select private.cypher_run_extraction(target_document, extracted_fields) $$;

create function public.cypher_register_generated_evidence(target_document uuid, generated jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cypher_register_generated_evidence(target_document, generated) $$;

create function public.cypher_execute_local_delivery(target_connector uuid, target_package uuid, request_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cypher_execute_local_delivery(target_connector, target_package, request_key) $$;

revoke all on function public.cypher_create_upload_intent(uuid, uuid, text, text, bigint, text) from public, anon;
revoke all on function public.cypher_request_export(uuid, text, text) from public, anon;
revoke all on function public.cypher_validate_document(uuid, text, text, jsonb) from public, anon;
revoke all on function public.cypher_transition_relationship(uuid, text, text) from public, anon;
revoke all on function public.cypher_transition_exception(uuid, text, text, uuid) from public, anon;
revoke all on function public.cypher_transition_obligation(uuid, text, text) from public, anon;
revoke all on function public.cypher_request_delivery(uuid, uuid, text) from public, anon;
revoke all on function public.cypher_run_extraction(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cypher_register_generated_evidence(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cypher_execute_local_delivery(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.cypher_create_upload_intent(uuid, uuid, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.cypher_request_export(uuid, text, text) to authenticated, service_role;
grant execute on function public.cypher_validate_document(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.cypher_transition_relationship(uuid, text, text) to authenticated, service_role;
grant execute on function public.cypher_transition_exception(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.cypher_transition_obligation(uuid, text, text) to authenticated, service_role;
grant execute on function public.cypher_request_delivery(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.cypher_run_extraction(uuid, jsonb) to service_role;
grant execute on function public.cypher_register_generated_evidence(uuid, jsonb) to service_role;
grant execute on function public.cypher_execute_local_delivery(uuid, uuid, text) to service_role;
