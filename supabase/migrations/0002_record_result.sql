-- Saliiim M1, migration 0002: final scores typed in after a match.
-- Adds the record_result event to append_event. Run this once in the Supabase SQL Editor
-- (or `supabase db push`); it only replaces the append_event function.

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
