alter table public.cypher_tenants
  add column if not exists slug text,
  add column if not exists public_label text,
  add column if not exists enrollment_mode text not null default 'invite_only'
    check (enrollment_mode in ('closed','invite_only','open_synthetic'));
create unique index if not exists cypher_tenants_slug_uidx on public.cypher_tenants(slug) where slug is not null;
insert into public.cypher_tenants(id,legacy_id,name,slug,public_label,enrollment_mode)
values ('a0a00000-0000-4000-8000-000000000001','advance-auto-parts-synthetic-pilot','Advance Auto Parts — Synthetic Pilot','advance-auto-parts-synthetic-pilot','Advance Auto Parts — Synthetic Pilot','open_synthetic')
on conflict (id) do update set slug=excluded.slug,public_label=excluded.public_label,enrollment_mode=excluded.enrollment_mode;
create or replace function private.cypher_claim_pilot_membership(company_slug text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.cypher_tenants; current_email text; confirmed timestamptz;
begin
 if auth.uid() is null or not private.active_session() then raise exception 'active authentication required'; end if;
 select lower(email),email_confirmed_at into current_email,confirmed from auth.users where id=auth.uid();
 if current_email is null or confirmed is null then raise exception 'confirmed email required'; end if;
 select * into target from public.cypher_tenants where slug=company_slug and enrollment_mode='open_synthetic';
 if target.id is null then raise exception 'pilot enrollment unavailable'; end if;
 insert into public.cypher_memberships(tenant_id,user_id,role,status) values(target.id,auth.uid(),'operator','active')
 on conflict(tenant_id,user_id) do update set status='active';
 return target.id;
end $$;
revoke all on function private.cypher_claim_pilot_membership(text) from public,anon,authenticated,service_role;
grant execute on function private.cypher_claim_pilot_membership(text) to authenticated,service_role;
create function public.cypher_claim_pilot_membership(company_slug text) returns uuid language sql security invoker set search_path='' as $$select private.cypher_claim_pilot_membership(company_slug)$$;
revoke all on function public.cypher_claim_pilot_membership(text) from public,anon;
grant execute on function public.cypher_claim_pilot_membership(text) to authenticated,service_role;
