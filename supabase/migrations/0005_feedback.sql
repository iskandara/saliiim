-- Saliiim M1, migration 0005: in-app feedback.
-- Run once in the Supabase SQL Editor. Read the feedback in Table Editor > feedback, or:
--   select created_at, rating, kind, message, contact, source, lang from public.feedback order by id desc;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rating smallint check (rating between 1 and 5),
  kind text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message text check (char_length(message) <= 2000),
  contact text check (char_length(contact) <= 120),
  -- Where it was sent from: the end-of-session summary or the feedback page.
  source text not null check (source in ('summary', 'page')),
  lang text check (lang in ('en', 'jksl')),
  session_id uuid references public.sessions on delete set null,
  -- A one-way hash of the anonymous device id, only to limit how often one phone can send.
  device_hash text not null,
  check (rating is not null or char_length(coalesce(message, '')) > 0)
);
create index if not exists feedback_by_device on public.feedback (device_hash, created_at);
alter table public.feedback enable row level security;
-- No policies: the app can only add feedback through submit_feedback, never read it.

create or replace function public.submit_feedback(p jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_message text := nullif(trim(coalesce(p ->> 'message', '')), '');
  v_contact text := nullif(trim(coalesce(p ->> 'contact', '')), '');
  v_rating smallint := nullif(p ->> 'rating', '')::smallint;
  v_session uuid := nullif(p ->> 'sessionId', '')::uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_hash := encode(digest(auth.uid()::text, 'sha256'), 'hex');
  if v_rating is null and v_message is null then raise exception 'empty_feedback'; end if;
  if (select count(*) from feedback where device_hash = v_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_much_feedback';
  end if;
  insert into feedback (rating, kind, message, contact, source, lang, session_id, device_hash)
  values (
    v_rating,
    coalesce(nullif(p ->> 'kind', ''), 'other'),
    left(v_message, 2000),
    left(v_contact, 120),
    coalesce(p ->> 'source', 'page'),
    nullif(p ->> 'lang', ''),
    case when v_session is not null and exists (select 1 from sessions where id = v_session) then v_session end,
    v_hash
  );
end $$;
grant execute on function public.submit_feedback(jsonb) to authenticated;
