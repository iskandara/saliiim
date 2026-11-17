-- Saliiim M1, migration 0004: the host steps off and everyone runs the session; matches can be postponed.
-- Run this once in the Supabase SQL Editor (or `supabase db push`). Safe to run again.
--
-- 1. After a step_off event, every approved player in that session counts as a co-host
--    (src/core/session.ts roleOf does the same). Join requests still wait for approval.
-- 2. append_event accepts postpone_match (host or co-host): the match goes to the end of the queue.

alter table public.sessions add column if not exists open_host boolean not null default false;

-- Sessions where the host already stepped off before this migration.
update public.sessions s set open_host = true
where not s.open_host
  and exists (select 1 from public.session_events e where e.session_id = s.id and e.type = 'step_off');

-- A player the host added, or whose join request was approved, and who was not removed.
create or replace function public._approved_player(p_session uuid, p_player text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select p_player is not null
    and exists (
      select 1 from session_events
      where session_id = p_session
        and ((type in ('add_player', 'add_late', 'approve_join') and payload ->> 'id' = p_player)
          or (type = 'create' and payload #>> '{hostPlayer,id}' = p_player)))
    and not exists (
      select 1 from session_events
      where session_id = p_session and type = 'remove_player' and payload ->> 'id' = p_player);
$$;

create or replace function public._role(p_session uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
    when r.role = 'player' and s.open_host and public._approved_player(p_session, r.player_id) then 'co_host'
    else r.role end
  from session_roles r join sessions s on s.id = r.session_id
  where r.session_id = p_session and r.device_id = auth.uid();
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
      else scorer_mode end,
    open_host = open_host or p_type = 'step_off'
  where id = p_session;
  return v_id;
end $$;

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
                'hand_scoring', 'promote', 'close', 'postpone_match') then
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

  elsif p_type = 'record_result' then
    -- Final score typed in after the match. Hosts may always; a player only from the phone holding the court.
    if v_role not in ('host', 'co_host') then
      select * into v_lock from court_locks
      where session_id = p_session and court = (p_payload ->> 'court')::int;
      if v_lock is null or v_lock.device_id <> v_me or v_lock.match_id <> p_payload ->> 'matchId' then
        raise exception 'no_lock';
      end if;
    else
      -- A host's entry finishes the match, so the court is free again.
      delete from court_locks where session_id = p_session and court = (p_payload ->> 'court')::int;
    end if;

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

revoke all on function public._approved_player(uuid, text) from public;
