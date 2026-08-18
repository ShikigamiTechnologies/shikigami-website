begin;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  requested_name text := trim(coalesce(new.raw_user_meta_data->>'organization_name', 'My Themis Workspace'));
  new_organization_id uuid;
  invite_token text := new.raw_user_meta_data->>'invite_token';
  matched_invite record;
begin
  -- This project now hosts Cypher staging. Preserve the legacy Themis trigger,
  -- but do not let its retired tables block unrelated Auth enrollment.
  if to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null
     or to_regclass('public.organization_invites') is null then
    return new;
  end if;

  if invite_token is not null then
    select * into matched_invite
    from public.organization_invites
    where token = invite_token
      and used_at is null
      and expires_at > now()
      and lower(email) = lower(new.email)
    limit 1;
  end if;

  if matched_invite.id is not null then
    insert into public.organization_members(organization_id, user_id, role)
    values (matched_invite.organization_id, new.id, matched_invite.role);

    update public.organization_invites
    set used_at = now()
    where id = matched_invite.id;

    return new;
  end if;

  if char_length(requested_name) not between 2 and 160 then
    requested_name := 'My Themis Workspace';
  end if;

  insert into public.organizations(name, owner_user_id, plan)
  values (requested_name, new.id, 'trial')
  returning id into new_organization_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (new_organization_id, new.id, 'owner');

  return new;
end;
$$;

commit;
