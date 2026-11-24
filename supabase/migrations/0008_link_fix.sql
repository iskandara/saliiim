-- Saliiim, migration 0008: session links that survive chat apps.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- Session codes were 12 characters of URL-safe base64, which can end in "-" or "_". Safari,
-- iMessage and WhatsApp often leave those out of the tappable link, so the link opened a
-- "session not found" page. New codes use letters and digits only, and opening a link now
-- also matches an existing code that lost its trailing "-" or "_".

create or replace function public._slug() returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', (get_byte(b, i) % 56) + 1, 1), '')
  from (select gen_random_bytes(12) as b) r, generate_series(0, 11) as i;
$$;

create or replace function public._find_slug(p_slug text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select id from sessions
  where slug = p_slug
     -- The same code with only trailing "-" or "_" missing (at most 3 characters).
     or (length(p_slug) >= 8 and slug like replace(replace(p_slug, '_', '\_'), '%', '\%') || '%'
         and length(slug) - length(p_slug) between 1 and 3
         and substr(slug, length(p_slug) + 1) ~ '^[-_]+$')
  order by (slug = p_slug) desc
  limit 1;
$$;

create or replace function public.open_public(p_slug text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me(); v_id uuid;
begin
  v_id := _find_slug(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  insert into session_roles (session_id, device_id, role) values (v_id, v_me, 'spectator')
  on conflict (session_id, device_id) do nothing;
  return v_id;
end $$;

revoke all on function public._find_slug(text) from public;
