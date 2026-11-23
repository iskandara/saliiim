-- Saliiim M2, migration 0007: counted results and levels (spec steps 2 and 3).
-- Run once in the Supabase SQL Editor after 0006.
--
-- When a session closes, the results Worker (worker/index.ts, on Cloudflare) replays its event log
-- with the app's own engine, rates each counted match, and stores the outcome here through
-- apply_results. Only the Worker can write: it calls with the Supabase secret key (service_role).

alter table public.sessions add column if not exists processed_at timestamptz;

-- One row per counted match (confirmed, host-entered, or corrected by the host).
create table if not exists public.match_results (
  session_id uuid not null references public.sessions on delete cascade,
  match_id text not null,
  ord int not null,
  played_at timestamptz not null,
  session_name text not null,
  format text not null check (format in ('singles', 'doubles')),
  games_to int not null,
  a_players text[] not null,
  b_players text[] not null,
  a_names text[] not null,
  b_names text[] not null,
  -- Account per player at the time; null for a guest.
  a_users uuid[] not null,
  b_users uuid[] not null,
  games_a int not null,
  games_b int not null,
  winner smallint not null check (winner in (0, 1)),
  primary key (session_id, match_id)
);
create index if not exists match_results_a_users on public.match_results using gin (a_users);
create index if not exists match_results_b_users on public.match_results using gin (b_users);
alter table public.match_results enable row level security;
-- No policies: profiles are read through the Worker, which applies each player's privacy settings.

-- Each account's level change per counted match.
create table if not exists public.rating_changes (
  session_id uuid not null references public.sessions on delete cascade,
  match_id text not null,
  user_id uuid not null,
  before real not null,
  after real not null,
  delta real not null,
  -- Position of the match in the session's rating order.
  ord int not null default 0,
  primary key (session_id, match_id, user_id)
);
create index if not exists rating_changes_by_user on public.rating_changes (user_id);
alter table public.rating_changes enable row level security;
-- Everyone in a session can see its level changes on the summary.
drop policy if exists rating_changes_read on public.rating_changes;
create policy rating_changes_read on public.rating_changes for select to authenticated using (public.is_member(session_id));

-- Stores one session's results and level changes in one go. The Worker passes each player's rating
-- as it read it; if any changed since (another session finished at the same moment) nothing is
-- written and it raises 'stale', so the Worker reads again and retries.
create or replace function public.apply_results(p_session uuid, p_rows jsonb, p_changes jsonb, p_expected jsonb, p_final jsonb)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_session record;
  v_e jsonb;
  v_p profiles;
begin
  select * into v_session from sessions where id = p_session for update;
  if v_session is null then raise exception 'not_found'; end if;
  if v_session.processed_at is not null then return 'already'; end if;
  if v_session.status <> 'closed' then raise exception 'not_closed'; end if;

  for v_e in select * from jsonb_array_elements(coalesce(p_expected, '[]'::jsonb)) loop
    select * into v_p from profiles where id = (v_e ->> 'user')::uuid for update;
    if v_p is null or v_p.rating <> (v_e ->> 'rating')::real or v_p.rated_matches <> (v_e ->> 'rated')::int then
      raise exception 'stale';
    end if;
  end loop;

  insert into match_results (session_id, match_id, ord, played_at, session_name, format, games_to,
    a_players, b_players, a_names, b_names, a_users, b_users, games_a, games_b, winner)
  select p_session, r ->> 'match_id', (r ->> 'ord')::int, coalesce(v_session.closed_at, now()), r ->> 'session_name',
    r ->> 'format', (r ->> 'games_to')::int,
    array(select jsonb_array_elements_text(r -> 'a_players')), array(select jsonb_array_elements_text(r -> 'b_players')),
    array(select jsonb_array_elements_text(r -> 'a_names')), array(select jsonb_array_elements_text(r -> 'b_names')),
    array(select nullif(x, '')::uuid from jsonb_array_elements_text(r -> 'a_users') x),
    array(select nullif(x, '')::uuid from jsonb_array_elements_text(r -> 'b_users') x),
    (r ->> 'games_a')::int, (r ->> 'games_b')::int, (r ->> 'winner')::smallint
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict do nothing;

  insert into rating_changes (session_id, match_id, user_id, before, after, delta, ord)
  select p_session, c ->> 'match_id', (c ->> 'user')::uuid, (c ->> 'before')::real, (c ->> 'after')::real, (c ->> 'delta')::real,
    coalesce((c ->> 'ord')::int, 0)
  from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
  on conflict do nothing;

  update profiles p set rating = (f ->> 'rating')::real, rated_matches = (f ->> 'rated')::int, updated_at = now()
  from jsonb_array_elements(coalesce(p_final, '[]'::jsonb)) f
  where p.id = (f ->> 'user')::uuid;

  update sessions set processed_at = now() where id = p_session;
  return 'done';
end $$;

-- Removes an account's personal data. Past results keep the guest name; the account link is cut.
create or replace function public.delete_account_data(p_user uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from profiles where id = p_user;
  delete from player_links where user_id = p_user;
  delete from rating_changes where user_id = p_user;
  delete from transfers where from_device = p_user;
  update match_results set a_users = array_replace(a_users, p_user, null), b_users = array_replace(b_users, p_user, null)
  where a_users @> array[p_user] or b_users @> array[p_user];
end $$;

revoke all on function public.apply_results(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.apply_results(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
    grant execute on function public.delete_account_data(uuid) to service_role;
  end if;
end $$;
