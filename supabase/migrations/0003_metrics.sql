-- Saliiim M1, migration 0003: privacy-friendly launch metrics.
-- Most PRD metrics come from the event log that already exists. A few moments that leave no trace
-- there (sticker downloads, link copies, installs) are counted in usage_events, with no device id,
-- name or IP stored. Read the results in the SQL Editor:
--   select * from analytics.prd_metrics;
--   select * from analytics.weekly;

create table public.usage_events (
  id bigint generated always as identity primary key,
  name text not null,
  session_id uuid references public.sessions on delete set null,
  created_at timestamptz not null default now()
);
alter table public.usage_events enable row level security;
-- No policies: nobody can read or write it through the API, only through track_event below.

create or replace function public.track_event(p_name text, p_session uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_name not in ('app_installed', 'sticker_downloaded', 'public_link_copied', 'host_link_copied', 'session_repeated', 'link_pasted') then
    raise exception 'unknown_metric';
  end if;
  insert into usage_events (name, session_id)
  values (p_name, case when p_session is not null and exists (select 1 from sessions where id = p_session) then p_session end);
end $$;
grant execute on function public.track_event(text, uuid) to authenticated;

-- Analytics lives in its own schema, which the Supabase API does not expose.
create schema if not exists analytics;
revoke all on schema analytics from public;

-- One row per session, derived from its event log.
create or replace view analytics.sessions_overview as
select
  s.id,
  s.created_at,
  s.status,
  s.closed_at,
  (select e.actor from public.session_events e where e.session_id = s.id and e.type = 'create' order by e.id limit 1) as host_device,
  (select e.payload ->> 'by' from public.session_events e where e.session_id = s.id and e.type = 'close' order by e.id desc limit 1) as closed_by,
  1 + (select count(*) from public.session_events e where e.session_id = s.id and e.type in ('add_player', 'add_late', 'join_request')) as players,
  (select count(*) from public.session_events e
     where e.session_id = s.id and ((e.type = 'add_player' and e.payload ->> 'via' = 'link') or e.type = 'join_request')) as joined_by_link,
  (select count(*) from public.session_events e where e.session_id = s.id and e.type = 'confirm') as results_confirmed,
  (select count(*) from public.session_events e where e.session_id = s.id and e.type = 'record_result') as results_entered,
  exists (select 1 from public.usage_events u where u.session_id = s.id and u.name = 'sticker_downloaded') as sticker_downloaded
from public.sessions s;

-- Week by week.
create or replace view analytics.weekly as
select
  date_trunc('week', created_at)::date as week,
  count(*) as sessions,
  count(distinct host_device) as hosts,
  round(100.0 * count(*) filter (where status = 'closed') / count(*), 1) as pct_closed,
  count(*) filter (where closed_by = 'auto') as auto_closed,
  round(100.0 * count(*) filter (where status = 'closed' and sticker_downloaded)
        / nullif(count(*) filter (where status = 'closed'), 0), 1) as pct_closed_with_sticker,
  sum(players) as players,
  sum(joined_by_link) as joined_by_link,
  sum(results_entered) as results_entered
from analytics.sessions_overview
group by 1
order by 1 desc;

-- The PRD's success metrics, for the last 8 weeks (repeat hosts use all history).
create or replace view analytics.prd_metrics as
with recent as (
  select * from analytics.sessions_overview where created_at > now() - interval '56 days'
),
firsts as (
  select host_device, min(created_at) as first_at from analytics.sessions_overview group by host_device
),
repeaters as (
  select f.host_device from firsts f
  where exists (
    select 1 from analytics.sessions_overview x
    where x.host_device = f.host_device and x.created_at > f.first_at and x.created_at <= f.first_at + interval '30 days'
  )
)
select
  (select round(count(*)::numeric / nullif(count(distinct host_device), 0), 2)
     from analytics.sessions_overview where created_at > now() - interval '30 days') as sessions_per_active_host_30d,
  (select round(100.0 * count(*) / nullif((select count(*) from firsts), 0), 1) from repeaters) as pct_hosts_second_session_30d,
  (select round(100.0 * count(*) filter (where status = 'closed') / nullif(count(*), 0), 1) from recent) as pct_sessions_closed,
  (select round(100.0 * sum(joined_by_link) / nullif(sum(players) - count(*), 0), 1) from recent) as pct_players_joined_by_link,
  (select round(100.0 * count(*) filter (where sticker_downloaded) / nullif(count(*) filter (where status = 'closed'), 0), 1)
     from recent) as pct_closed_with_sticker,
  (select count(*) from public.usage_events where name = 'app_installed' and created_at > now() - interval '56 days') as installs_8w,
  (select count(*) from public.usage_events where name = 'public_link_copied' and created_at > now() - interval '56 days') as links_copied_8w;
