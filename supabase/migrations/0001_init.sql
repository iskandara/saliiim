-- Saliiim M1 schema.
-- Each session is an ordered event log. Clients replay it with the same rules (src/core/session.ts).
-- Every write goes through the functions below, which check the caller's role and court lock.
-- Callers are Supabase anonymous users: auth.uid() is the device id.

create extension if not exists pgcrypto;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  host_key_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  scorer_mode text not null default 'host' check (scorer_mode in ('host', 'players')),
  created_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.session_roles (
  session_id uuid not null references public.sessions on delete cascade,
  device_id uuid not null,
  role text not null check (role in ('host', 'co_host', 'player', 'spectator')),
  player_id text,
  created_at timestamptz not null default now(),
  primary key (session_id, device_id)
);
create unique index session_roles_player on public.session_roles (session_id, player_id) where player_id is not null;

create table public.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index session_events_by_session on public.session_events (session_id, id);

create table public.court_locks (
  session_id uuid not null references public.sessions on delete cascade,
  court int not null,
  match_id text not null,
  device_id uuid not null,
  heartbeat_at timestamptz not null default now(),
  primary key (session_id, court)
);

-- Reads: only members of a session (anyone who opened its link) can read it.
alter table public.sessions enable row level security;
alter table public.session_roles enable row level security;
alter table public.session_events enable row level security;
alter table public.court_locks enable row level security;

create or replace function public.is_member(p_session uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from session_roles where session_id = p_session and device_id = auth.uid());
$$;

create policy sessions_read on public.sessions for select to authenticated using (public.is_member(id));
create policy roles_read on public.session_roles for select to authenticated using (public.is_member(session_id));
create policy events_read on public.session_events for select to authenticated using (public.is_member(session_id));
create policy locks_read on public.court_locks for select to authenticated using (public.is_member(session_id));
-- No insert/update/delete policies: writes only happen inside the functions below.

-- Helpers

create or replace function public._me() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return auth.uid();
end $$;

create or replace function public._role(p_session uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select role from session_roles where session_id = p_session and device_id = auth.uid();
$$;

create or replace function public._emit(p_session uuid, p_type text, p_payload jsonb, p_actor uuid)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  insert into session_events (session_id, type, payload, actor)
  values (p_session, p_type, coalesce(p_payload, '{}'::jsonb), p_actor)
  returning id into v_id;

  update sessions set
    last_event_at = now(),
    status = case
      when p_type = 'start' then 'live'
      when p_type = 'close' then 'closed'
      else status end,
    closed_at = case when p_type = 'close' then now() else closed_at end,
    scorer_mode = case
      when p_type in ('hand_scoring', 'step_off') then 'players'
      when p_type in ('create', 'update_settings') then coalesce(p_payload #>> '{settings,scorerMode}', scorer_mode)
      else scorer_mode end
  where id = p_session;
  return v_id;
end $$;

create or replace function public._player_exists(p_session uuid, p_player text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from session_events
    where session_id = p_session
      and ((type in ('add_player', 'add_late', 'join_request') and payload ->> 'id' = p_player)
        or (type = 'create' and payload #>> '{hostPlayer,id}' = p_player))
  );
$$;

create or replace function public._slug() returns text language sql volatile set search_path = public, extensions as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
$$;

-- Session lifecycle

create or replace function public.create_session(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := _me();
  v_key text := encode(gen_random_bytes(18), 'hex');
  v_slug text := _slug();
  v_id uuid;
begin
  if coalesce(p_payload #>> '{hostPlayer,id}', '') = '' then raise exception 'bad_payload'; end if;
  insert into sessions (slug, host_key_hash) values (v_slug, encode(digest(v_key, 'sha256'), 'hex')) returning id into v_id;
  insert into session_roles (session_id, device_id, role, player_id)
  values (v_id, v_me, 'host', p_payload #>> '{hostPlayer,id}');
  perform _emit(v_id, 'create', p_payload || jsonb_build_object('slug', v_slug), v_me);
  return jsonb_build_object('id', v_id, 'slug', v_slug, 'hostKey', v_key);
end $$;

-- Opening the private host link on another phone.
create or replace function public.claim_host(p_session uuid, p_key text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me();
begin
  if not exists (select 1 from sessions where id = p_session and host_key_hash = encode(digest(p_key, 'sha256'), 'hex')) then
    raise exception 'bad_host_key';
  end if;
  insert into session_roles (session_id, device_id, role) values (p_session, v_me, 'host')
  on conflict (session_id, device_id) do update set role = 'host';
  perform _emit(p_session, 'host_device', jsonb_build_object('deviceId', v_me), v_me);
end $$;

-- Opening the public link: registers this phone as a spectator so it can read the session.
create or replace function public.open_public(p_slug text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := _me(); v_id uuid;
begin
  select id into v_id from sessions where slug = p_slug;
  if v_id is null then raise exception 'not_found'; end if;
  insert into session_roles (session_id, device_id, role) values (v_id, v_me, 'spectator')
  on conflict (session_id, device_id) do nothing;
  return v_id;
end $$;

-- "Join to play" with a new name. After the start it becomes a join request the host approves.
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
end $$;

-- "That's me" on a name the host added.
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
end $$;

-- All other events

create or replace function public.append_event(p_session uuid, p_type text, p_payload jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := _me();
  v_role text := _role(p_session);
  v_session record;
  v_lock record;
  v_target uuid;
begin
  select * into v_session from sessions where id = p_session;
  if v_session is null then raise exception 'not_found'; end if;
  if v_role is null then raise exception 'not_member'; end if;
  if v_session.status = 'closed' then raise exception 'session_closed'; end if;

  if p_type in ('update_settings', 'add_player', 'remove_player', 'reset_claim', 'approve_join', 'decline_join',
                'set_pairs', 'start', 'add_late', 'mark_left', 'step_off', 'skip_match', 'unskip_match', 'edit_result',
                'hand_scoring', 'promote', 'close') then
    if v_role not in ('host', 'co_host') then raise exception 'host_only'; end if;
    if p_type = 'promote' and v_role <> 'host' then raise exception 'host_only'; end if;
    if p_type = 'add_player' and coalesce(p_payload ->> 'via', '') <> 'manual' then raise exception 'bad_payload'; end if;
    if p_type = 'close' then p_payload := jsonb_build_object('by', 'host'); end if;

  elsif p_type in ('point', 'undo', 'set_server') then
    select * into v_lock from court_locks
    where session_id = p_session and court = (p_payload ->> 'court')::int;
    if v_lock is null or v_lock.device_id <> v_me or v_lock.match_id <> p_payload ->> 'matchId' then
      raise exception 'no_lock';
    end if;
    update court_locks set heartbeat_at = now() where session_id = p_session and court = v_lock.court;

  elsif p_type = 'confirm' then
    select * into v_lock from court_locks
    where session_id = p_session and court = (p_payload ->> 'court')::int;
    if not (v_role in ('host', 'co_host')
            or (v_session.scorer_mode = 'players' and v_role = 'player' and (v_lock is null or v_lock.device_id <> v_me))) then
      raise exception 'cannot_confirm';
    end if;
    delete from court_locks where session_id = p_session and court = (p_payload ->> 'court')::int;

  else
    raise exception 'unknown_event';
  end if;

  -- Side effects on roles.
  if p_type = 'promote' then
    select device_id into v_target from session_roles where session_id = p_session and player_id = p_payload ->> 'playerId';
    if v_target is null then raise exception 'not_claimed'; end if;
    update session_roles set role = 'co_host' where session_id = p_session and device_id = v_target and role <> 'host';
  elsif p_type = 'reset_claim' then
    update session_roles set player_id = null, role = case when role in ('player', 'co_host') then 'spectator' else role end
    where session_id = p_session and player_id = p_payload ->> 'playerId';
  end if;

  return _emit(p_session, p_type, p_payload, v_me);
end $$;

-- Court locks: one scoring phone per court

create or replace function public.acquire_lock(p_session uuid, p_court int, p_match_id text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := _me();
  v_role text := _role(p_session);
  v_session record;
  v_lock record;
begin
  select * into v_session from sessions where id = p_session;
  if v_session is null or v_session.status <> 'live' then raise exception 'not_live'; end if;
  if v_role is null or not (v_role in ('host', 'co_host') or (v_role = 'player' and v_session.scorer_mode = 'players')) then
    raise exception 'cannot_score';
  end if;
  select * into v_lock from court_locks where session_id = p_session and court = p_court for update;
  if v_lock is not null and v_lock.device_id <> v_me and v_lock.match_id = p_match_id and not p_force then
    return jsonb_build_object('ok', false, 'holder', v_lock.device_id,
                              'stale', v_lock.heartbeat_at < now() - interval '60 seconds');
  end if;
  insert into court_locks (session_id, court, match_id, device_id) values (p_session, p_court, p_match_id, v_me)
  on conflict (session_id, court) do update set match_id = excluded.match_id, device_id = excluded.device_id, heartbeat_at = now();
  return jsonb_build_object('ok', true, 'holder', v_me, 'stale', false);
end $$;

create or replace function public.heartbeat_lock(p_session uuid, p_court int) returns void
language sql security definer set search_path = public, extensions as $$
  update court_locks set heartbeat_at = now() where session_id = p_session and court = p_court and device_id = auth.uid();
$$;

create or replace function public.release_lock(p_session uuid, p_court int) returns void
language sql security definer set search_path = public, extensions as $$
  delete from court_locks where session_id = p_session and court = p_court and device_id = auth.uid();
$$;

-- Scheduled jobs

-- Closes live sessions after 3 hours with no activity, so every session ends with a summary.
create or replace function public.auto_close_sessions() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare v_row record; v_count int := 0;
begin
  for v_row in select id from sessions where status = 'live' and last_event_at < now() - interval '3 hours' loop
    perform _emit(v_row.id, 'close', jsonb_build_object('by', 'auto'), null);
    delete from court_locks where session_id = v_row.id;
    v_count := v_count + 1;
  end loop;
  delete from court_locks where heartbeat_at < now() - interval '3 hours';
  return v_count;
end $$;

-- Grants

revoke all on function public._emit(uuid, text, jsonb, uuid) from public;
revoke all on function public.auto_close_sessions() from public;
revoke all on function public._player_exists(uuid, text) from public;
grant execute on function public.create_session(jsonb), public.claim_host(uuid, text), public.open_public(text),
  public.join_session(uuid, text, text), public.claim_player(uuid, text), public.append_event(uuid, text, jsonb),
  public.acquire_lock(uuid, int, text, boolean), public.heartbeat_lock(uuid, int), public.release_lock(uuid, int)
  to authenticated;

-- Realtime and cron (skipped where the platform lacks them)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.session_events, public.court_locks;
  end if;
end $$;

do $$
begin
  begin
    create extension if not exists pg_cron;
    perform cron.schedule('saliiim-auto-close', '*/10 * * * *', 'select public.auto_close_sessions()');
  exception when others then
    raise notice 'pg_cron not available (%). Enable it in Supabase > Database > Extensions, then run the cron.schedule line.', sqlerrm;
  end;
end $$;
