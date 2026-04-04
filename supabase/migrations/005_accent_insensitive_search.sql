create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(text)
  returns text
  language sql immutable strict parallel safe
as $$
  select extensions.unaccent($1)
$$;

create index if not exists targets_name_unaccent_idx
  on targets (lower(public.immutable_unaccent(name)));
