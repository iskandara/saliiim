-- Saliiim M2, migration 0006: accounts (spec step 1).
-- Run once in the Supabase SQL Editor after 0001-0005.
--
-- Phones still sign in anonymously; a guest becomes an account by signing in with Google or email.
-- Hosts must have an account to create a session. A guest who signs up during a session, or within
-- 7 days of it closing, takes that session's player with them through a one-time transfer ticket.

-- True when the caller is signed in with Google or email, not as an anonymous guest.
create or replace function public._is_account() returns boolean
language sql stable as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- Profiles

create table if not exists public.profiles (
  id uuid primary key,
  name text not null check (char_length(trim(name)) between 1 and 40),
  photo_url text check (char_length(photo_url) <= 500),
  city text check (char_length(city) <= 60),
  hand text check (hand in ('left', 'right')),
  format_pref text check (format_pref in ('singles', 'doubles', 'both')),
  start_level text not null check (start_level in ('beginner', 'intermediate', 'advanced', 'competitive')),
  -- Elo-style rating; the level shown is rating / 400 (spec: Rating).
  rating real not null,
  rated_matches int not null default 0,
  is_public boolean not null default true,
  show_basics boolean not null default true,
  show_stats boolean not null default true,
  show_h2h boolean not null default true,
  show_history boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- No policies: profiles are read and written through the functions below.

create or replace function public._start_rating(p_level text) returns real
language sql immutable as $$
  select case p_level when 'beginner' then 800 when 'intermediate' then 1200 when 'advanced' then 1600 else 2000 end::real;
$$;

create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select to_jsonb(p) from profiles p where p.id = auth.uid();
$$;

-- Creates or updates the caller's profile. The starting level can change until the first counted match.
create or replace function public.save_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_row profiles;
begin
  if not _is_account() then raise exception 'sign_in_required'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'bad_name'; end if;
  insert into profiles (id, name, photo_url, city, hand, format_pref, start_level, rating)
  values (
    auth.uid(), trim(p ->> 'name'), nullif(p ->> 'photoUrl', ''), nullif(trim(coalesce(p ->> 'city', '')), ''),
    nullif(p ->> 'hand', ''), nullif(p ->> 'formatPref', ''), coalesce(p ->> 'startLevel', 'intermediate'),
    _start_rating(coalesce(p ->> 'startLevel', 'intermediate'))
  )
  on conflict (id) do update set
    name = excluded.name,
    photo_url = coalesce(excluded.photo_url, profiles.photo_url),
    city = case when p ? 'city' then excluded.city else profiles.city end,
    hand = case when p ? 'hand' then excluded.hand else profiles.hand end,
    format_pref = case when p ? 'formatPref' then excluded.format_pref else profiles.format_pref end,
    start_level = case when profiles.rated_matches = 0 and p ? 'startLevel' then excluded.start_level else profiles.start_level end,
    rating = case when profiles.rated_matches = 0 and p ? 'startLevel' then excluded.rating else profiles.rating end,
    is_public = coalesce((p ->> 'isPublic')::boolean, profiles.is_public),
    show_basics = coalesce((p ->> 'showBasics')::boolean, profiles.show_basics),
    show_stats = coalesce((p ->> 'showStats')::boolean, profiles.show_stats),
    show_h2h = coalesce((p ->> 'showH2h')::boolean, profiles.show_h2h),
    show_history = coalesce((p ->> 'showHistory')::boolean, profiles.show_history),
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Which account each player in a session belongs to.

create table if not exists public.player_links (
  session_id uuid not null references public.sessions on delete cascade,
  player_id text not null,
  user_id uuid not null,
  linked_at timestamptz not null default now(),
  primary key (session_id, player_id),
  unique (session_id, user_id)
);
create index if not exists player_links_by_user on public.player_links (user_id);
alter table public.player_links enable row level security;
create policy links_read on public.player_links for select to authenticated using (public.is_member(session_id));

create or replace function public._link_player(p_session uuid, p_player text) returns void
language sql security definer set search_path = public, extensions as $$
  insert into player_links (session_id, player_id, user_id) values (p_session, p_player, auth.uid())
  on conflict do nothing;
$$;

-- Hosts need an account; the host's own player is linked to it.
create or replace function public.create_session(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := _me();
  v_key text := encode(gen_random_bytes(18), 'hex');
  v_slug text := _slug();
  v_id uuid;
begin
  if not _is_account() then raise exception 'sign_in_required'; end if;
  if coalesce(p_payload #>> '{hostPlayer,id}', '') = '' then raise exception 'bad_payload'; end if;
  insert into sessions (slug, host_key_hash) values (v_slug, encode(digest(v_key, 'sha256'), 'hex')) returning id into v_id;
  insert into session_roles (session_id, device_id, role, player_id)
  values (v_id, v_me, 'host', p_payload #>> '{hostPlayer,id}');
  perform _emit(v_id, 'create', p_payload || jsonb_build_object('slug', v_slug), v_me);
  perform _link_player(v_id, p_payload #>> '{hostPlayer,id}');
  return jsonb_build_object('id', v_id, 'slug', v_slug, 'hostKey', v_key);
end $$;

-- Joining or claiming a name while signed in links the player to the account straight away.
create or replace function public.join_session(p_session uuid, p_player_id text, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me(); v_status text; v_role record;
begin
  select status into v_status from sessions where id = p_session;
  select * into v_role from session_roles where session_id = p_session and device_id = v_me;
  if v_role is null then raise exception 'not_member'; end if;
  if v_status = 'closed' then raise exception 'session_closed'; end if;
  if v_role.player_id is not null then raise exception 'device_has_player'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 40 then raise exception 'bad_name'; end if;
  if _player_exists(p_session, p_player_id) then raise exception 'duplicate'; end if;

  if v_status = 'draft' then
    perform _emit(p_session, 'add_player', jsonb_build_object('id', p_player_id, 'name', trim(p_name), 'via', 'link'), v_me);
  else
    perform _emit(p_session, 'join_request', jsonb_build_object('id', p_player_id, 'name', trim(p_name)), v_me);
  end if;
  update session_roles set player_id = p_player_id, role = case when role = 'spectator' then 'player' else role end
  where session_id = p_session and device_id = v_me;
  perform _emit(p_session, 'claim', jsonb_build_object('playerId', p_player_id, 'deviceId', v_me), v_me);
  if _is_account() then perform _link_player(p_session, p_player_id); end if;
end $$;

create or replace function public.claim_player(p_session uuid, p_player_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me(); v_role record;
begin
  select * into v_role from session_roles where session_id = p_session and device_id = v_me;
  if v_role is null then raise exception 'not_member'; end if;
  if (select status from sessions where id = p_session) = 'closed' then raise exception 'session_closed'; end if;
  if v_role.player_id is not null then raise exception 'device_has_player'; end if;
  if not _player_exists(p_session, p_player_id) then raise exception 'unknown_player'; end if;
  if exists (select 1 from session_roles where session_id = p_session and player_id = p_player_id) then
    raise exception 'claimed';
  end if;
  update session_roles set player_id = p_player_id, role = case when role = 'spectator' then 'player' else role end
  where session_id = p_session and device_id = v_me;
  perform _emit(p_session, 'claim', jsonb_build_object('playerId', p_player_id, 'deviceId', v_me), v_me);
  if _is_account() then perform _link_player(p_session, p_player_id); end if;
end $$;

-- Guest to account: a one-time ticket made while still a guest, redeemed after signing in.

create table if not exists public.transfers (
  token text primary key,
  session_id uuid not null references public.sessions on delete cascade,
  from_device uuid not null,
  player_id text not null,
  created_at timestamptz not null default now()
);
alter table public.transfers enable row level security;

create or replace function public.start_transfer(p_session uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me(); v_player text; v_session record; v_token text;
begin
  select * into v_session from sessions where id = p_session;
  if v_session is null then raise exception 'not_found'; end if;
  if v_session.status = 'closed' and v_session.closed_at < now() - interval '7 days' then raise exception 'claim_expired'; end if;
  select player_id into v_player from session_roles where session_id = p_session and device_id = v_me;
  if v_player is null then return null; end if;
  delete from transfers where from_device = v_me or created_at < now() - interval '1 day';
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into transfers (token, session_id, from_device, player_id) values (v_token, p_session, v_me, v_player);
  return v_token;
end $$;

-- Moves the guest's player in that one session to the signed-in account, then links it.
create or replace function public.finish_transfer(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := _me();
  v_t transfers;
  v_old session_roles;
  v_new session_roles;
  v_rank int;
  v_role text;
begin
  if not _is_account() then raise exception 'sign_in_required'; end if;
  select * into v_t from transfers where token = p_token and created_at > now() - interval '1 day';
  if v_t is null then raise exception 'transfer_expired'; end if;
  delete from transfers where token = p_token;
  if v_t.from_device <> v_me then
    select * into v_old from session_roles where session_id = v_t.session_id and device_id = v_t.from_device;
    if v_old is null or v_old.player_id is distinct from v_t.player_id then raise exception 'transfer_stale'; end if;
    select * into v_new from session_roles where session_id = v_t.session_id and device_id = v_me;
    if v_new.player_id is not null and v_new.player_id <> v_t.player_id then raise exception 'device_has_player'; end if;
    -- Keep the higher of the two roles this person had in the session.
    v_rank := greatest(
      case v_old.role when 'host' then 3 when 'co_host' then 2 when 'player' then 1 else 0 end,
      case coalesce(v_new.role, 'spectator') when 'host' then 3 when 'co_host' then 2 when 'player' then 1 else 0 end);
    v_role := case v_rank when 3 then 'host' when 2 then 'co_host' else 'player' end;
    delete from session_roles where session_id = v_t.session_id and device_id in (v_t.from_device, v_me);
    insert into session_roles (session_id, device_id, role, player_id) values (v_t.session_id, v_me, v_role, v_t.player_id);
    update court_locks set device_id = v_me where session_id = v_t.session_id and device_id = v_t.from_device;
    perform _emit(v_t.session_id, 'rebind', jsonb_build_object('playerId', v_t.player_id, 'from', v_t.from_device, 'to', v_me), v_me);
  end if;
  perform _link_player(v_t.session_id, v_t.player_id);
  return v_t.session_id;
end $$;

-- Sessions this account hosted or played, for Home on any device.
create or replace function public.my_sessions() returns table (id uuid, slug text, name text, role text, status text, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, s.slug, (select e.payload #>> '{settings,name}' from session_events e where e.session_id = s.id and e.type = 'create' order by e.id limit 1),
         r.role, s.status, s.created_at
  from session_roles r join sessions s on s.id = r.session_id
  where r.device_id = auth.uid() and _is_account() and (r.role in ('host', 'co_host') or r.player_id is not null)
  order by s.created_at desc
  limit 50;
$$;

revoke all on function public._link_player(uuid, text) from public;
grant execute on function public.my_profile(), public.save_profile(jsonb), public.start_transfer(uuid),
  public.finish_transfer(text), public.my_sessions() to authenticated;
