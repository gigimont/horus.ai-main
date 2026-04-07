-- Function: called after a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_tenant_id uuid;
  fund_name text;
begin
  fund_name := coalesce(
    new.raw_user_meta_data->>'fund_name',
    split_part(new.email, '@', 1) || '''s Fund'
  );

  insert into public.tenants (name, slug, plan)
  values (
    fund_name,
    lower(regexp_replace(fund_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substr(new.id::text, 1, 6),
    'trial'
  )
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, role, full_name)
  values (
    new.id,
    new_tenant_id,
    'owner',
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_tenant_id uuid;
begin
  select tenant_id into user_tenant_id
  from public.users
  where id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if user_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;
