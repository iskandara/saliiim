/**
 * Runs the Supabase migration on an in-memory Postgres (PGlite) and checks the access rules.
 * auth.uid() is stubbed to read the device id we set, like Supabase does from the JWT.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { processSession } from '../src/core/processSession';
import { reduceSession, type SessionEvent } from '../src/core/session';
import { DEFAULT_SETTINGS } from '../src/core/types';

const HOST = '00000000-0000-4000-8000-000000000001';
const SARI = '00000000-0000-4000-8000-000000000002';
const BAYU = '00000000-0000-4000-8000-000000000003';
const STRANGER = '00000000-0000-4000-8000-000000000004';
const OTHER_PHONE = '00000000-0000-4000-8000-000000000005';

let db: PGlite;
let sessionId: string;
let slug: string;
let hostKey: string;

/** Phones signed in with Google or email; everyone else is an anonymous guest. */
const ACCOUNTS = new Set<string>();

async function as<T = Record<string, unknown>>(device: string, sql: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [device]);
  await db.query(`select set_config('request.jwt.claim.anon', $1, false)`, [ACCOUNTS.has(device) ? 'false' : 'true']);
  return (await db.query<T>(sql, params)).rows;
}

async function fails(device: string, sql: string, params: unknown[], code: string) {
  await expect(as(device, sql, params)).rejects.toThrow(code);
}

const point = (court: number, matchId: string, team: number) => JSON.stringify({ court, matchId, team });

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select jsonb_build_object('is_anonymous', coalesce(current_setting('request.jwt.claim.anon', true), 'true') <> 'false') $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0002_record_result.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0003_metrics.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0004_open_host_postpone.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0005_feedback.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0006_accounts.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0007_results.sql', 'utf8'));
  await db.exec(`grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;`);
});

describe('supabase migration', () => {
  it('only an account can host', async () => {
    const payload = { settings: { ...DEFAULT_SETTINGS, name: 'Guest try' }, hostPlayer: { id: 'g', name: 'G' } };
    await fails(HOST, `select public.create_session($1)`, [JSON.stringify(payload)], 'sign_in_required');
    ACCOUNTS.add(HOST);
    ACCOUNTS.add(OTHER_PHONE);
  });

  it('host creates a session', async () => {
    const payload = { settings: { ...DEFAULT_SETTINGS, name: 'Saturday', hostName: 'Dimas', format: 'singles' }, hostPlayer: { id: 'dimas', name: 'Dimas' } };
    const [row] = await as<{ r: { id: string; slug: string; hostKey: string } }>(HOST, `select public.create_session($1) as r`, [JSON.stringify(payload)]);
    ({ id: sessionId, slug, hostKey } = row!.r);
    expect(slug.length).toBeGreaterThan(8);
    expect(hostKey).toHaveLength(36);
  });

  it('players join through the public link and cannot send host events', async () => {
    for (const [device, id, name] of [[SARI, 'sari', 'Sari'], [BAYU, 'bayu', 'Bayu']] as const) {
      const [open] = await as<{ id: string }>(device, `select public.open_public($1) as id`, [slug]);
      expect(open!.id).toBe(sessionId);
      await as(device, `select public.join_session($1, $2, $3)`, [sessionId, id, name]);
    }
    await fails(SARI, `select public.join_session($1, 'sari2', 'Sari again')`, [sessionId], 'device_has_player');
    await fails(SARI, `select public.append_event($1, 'start', '{}')`, [sessionId], 'host_only');
    await fails(STRANGER, `select public.append_event($1, 'start', '{}')`, [sessionId], 'not_member');
  });

  it('host starts; only lock holders score; confirm comes from someone else', async () => {
    await as(HOST, `select public.append_event($1, 'start', '{}')`, [sessionId]);
    // Host-only scoring: players cannot take a court.
    await fails(SARI, `select public.acquire_lock($1, 1, 'm1')`, [sessionId], 'cannot_score');
    await as(HOST, `select public.append_event($1, 'hand_scoring', '{}')`, [sessionId]);

    const [lock] = await as<{ r: { ok: boolean } }>(SARI, `select public.acquire_lock($1, 1, 'm1') as r`, [sessionId]);
    expect(lock!.r.ok).toBe(true);
    const [taken] = await as<{ r: { ok: boolean; holder: string } }>(BAYU, `select public.acquire_lock($1, 1, 'm1') as r`, [sessionId]);
    expect(taken!.r).toMatchObject({ ok: false, holder: SARI });

    await as(SARI, `select public.append_event($1, 'point', $2)`, [sessionId, point(1, 'm1', 0)]);
    await fails(BAYU, `select public.append_event($1, 'point', $2)`, [sessionId, point(1, 'm1', 1)], 'no_lock');

    await fails(SARI, `select public.append_event($1, 'confirm', $2)`, [sessionId, JSON.stringify({ court: 1, matchId: 'm1' })], 'cannot_confirm');
    const [forced] = await as<{ r: { ok: boolean } }>(BAYU, `select public.acquire_lock($1, 1, 'm1', true) as r`, [sessionId]);
    expect(forced!.r.ok).toBe(true);
    await fails(SARI, `select public.append_event($1, 'point', $2)`, [sessionId, point(1, 'm1', 0)], 'no_lock');
  });

  it('typed-in final score: lock holder or host only; a host entry frees the court', async () => {
    const res = (gamesA: number, gamesB: number) => JSON.stringify({ court: 1, matchId: 'm1', gamesA, gamesB });
    await fails(SARI, `select public.append_event($1, 'record_result', $2)`, [sessionId, res(4, 1)], 'no_lock');
    await as(BAYU, `select public.append_event($1, 'record_result', $2)`, [sessionId, res(1, 4)]);
    await as(HOST, `select public.append_event($1, 'record_result', $2)`, [sessionId, res(4, 2)]);
    const [locks] = await as<{ n: number }>(HOST, `select count(*)::int as n from public.court_locks where session_id = $1`, [sessionId]);
    expect(locks!.n).toBe(0);
  });

  it('metrics: only known counters, no personal data, and the PRD views compute', async () => {
    await as(SARI, `select public.track_event('sticker_downloaded', $1)`, [sessionId]);
    await as(STRANGER, `select public.track_event('link_pasted')`);
    await fails(SARI, `select public.track_event('anything_else')`, [], 'unknown_metric');
    const cols = await as<{ column_name: string }>(HOST, `select column_name from information_schema.columns where table_name = 'usage_events' order by ordinal_position`);
    expect(cols.map((c) => c.column_name)).toEqual(['id', 'name', 'session_id', 'created_at']);
    const [m] = await as<Record<string, unknown>>(HOST, `select * from analytics.prd_metrics`);
    expect(m).toHaveProperty('pct_sessions_closed');
    const [w] = await as<{ sessions: number; players: number }>(HOST, `select sessions::int, players::int from analytics.weekly`);
    expect(w).toMatchObject({ sessions: 1, players: 3 });
  });

  it('feedback: needs a rating or a message, is rate limited, and stores no device id', async () => {
    const fb = (body: Record<string, unknown>) => JSON.stringify({ kind: 'bug', source: 'summary', lang: 'en', sessionId, ...body });
    await fails(BAYU, `select public.submit_feedback($1)`, [fb({ rating: null, message: '  ' })], 'empty_feedback');
    await as(BAYU, `select public.submit_feedback($1)`, [fb({ rating: 4, message: 'Scores lagged once', contact: 'wa 0812' })]);
    for (let i = 0; i < 4; i++) await as(BAYU, `select public.submit_feedback($1)`, [fb({ rating: 5, message: '' })]);
    await fails(BAYU, `select public.submit_feedback($1)`, [fb({ rating: 5 })], 'too_much_feedback');
    const rows = await as<{ rating: number; message: string | null; session_id: string; device_hash: string }>(
      HOST, `select rating, message, session_id, device_hash from public.feedback order by id`);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ rating: 4, message: 'Scores lagged once', session_id: sessionId });
    expect(rows[1]!.message).toBeNull();
    expect(rows[0]!.device_hash).not.toContain(BAYU);
  });

  it('only members can read the session (row level security)', async () => {
    await as(STRANGER, `set role authenticated`);
    const none = await as(STRANGER, `select count(*)::int as n from public.session_events where session_id = $1`, [sessionId]);
    expect(none[0]).toEqual({ n: 0 });
    const counters = await as(STRANGER, `select count(*)::int as n from public.usage_events`);
    expect(counters[0]).toEqual({ n: 0 });
    const feedback = await as(STRANGER, `select count(*)::int as n from public.feedback`);
    expect(feedback[0]).toEqual({ n: 0 });
    const some = await as<{ n: number }>(SARI, `select count(*)::int as n from public.session_events where session_id = $1`, [sessionId]);
    expect(some[0]!.n).toBeGreaterThan(5);
    await db.exec(`reset role`);
  });

  it('the event log replays into the same session in TypeScript', async () => {
    const rows = await as<{ id: number; type: string; payload: Record<string, unknown>; actor: string | null; created_at: Date }>(
      HOST, `select id, type, payload, actor, created_at from public.session_events where session_id = $1 order by id`, [sessionId]);
    const events = rows.map((r) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at.toISOString() }) as SessionEvent);
    const s = reduceSession(events);
    expect(s.ignored).toEqual([]);
    expect(s.status).toBe('live');
    expect(s.players.map((p) => p.name)).toEqual(['Dimas', 'Sari', 'Bayu']);
    expect(s.players.find((p) => p.id === 'sari')!.deviceId).toBe(SARI);
    expect(s.settings.scorerMode).toBe('players');
  });

  it('the host link adds host rights on another phone', async () => {
    await fails(OTHER_PHONE, `select public.claim_host($1, 'wrong')`, [sessionId], 'bad_host_key');
    await as(OTHER_PHONE, `select public.claim_host($1, $2)`, [sessionId, hostKey]);
    await as(OTHER_PHONE, `select public.append_event($1, 'skip_match', '{"matchId":"m2"}')`, [sessionId]);
  });

  it('after the host steps off, players run the session and can postpone a match', async () => {
    await fails(SARI, `select public.append_event($1, 'close', '{}')`, [sessionId], 'host_only');
    await as(HOST, `select public.append_event($1, 'step_off', '{"live":"skip"}')`, [sessionId]);
    // Sari is a co-host now: she can add a late arrival, which builds new matches.
    await as(SARI, `select public.append_event($1, 'add_late', '{"id":"tari","name":"Tari"}')`, [sessionId]);
    const rows = await as<{ id: number; type: string; payload: Record<string, unknown>; actor: string | null; created_at: Date }>(
      HOST, `select id, type, payload, actor, created_at from public.session_events where session_id = $1 order by id`, [sessionId]);
    const s = reduceSession(rows.map((r) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at.toISOString() }) as SessionEvent));
    expect(s.ignored).toEqual([]);
    const target = s.matches.find((m) => m.status === 'live' || m.status === 'queued')!;
    await as(SARI, `select public.append_event($1, 'postpone_match', $2)`, [sessionId, JSON.stringify({ matchId: target.id })]);
    await fails(SARI, `select public.append_event($1, 'promote', '{"playerId":"bayu"}')`, [sessionId], 'host_only');
    await fails(STRANGER, `select public.append_event($1, 'postpone_match', '{}')`, [sessionId], 'not_member');
  });

  it('accounts: profile, auto-link on join, and a guest taking their player along on sign-up', async () => {
    const GUEST = '00000000-0000-4000-8000-000000000010';
    const ACCOUNT = '00000000-0000-4000-8000-000000000011';
    const SIGNED = '00000000-0000-4000-8000-000000000012';
    await fails(GUEST, `select public.save_profile($1)`, [JSON.stringify({ name: 'G' })], 'sign_in_required');
    ACCOUNTS.add(SIGNED);
    const [prof] = await as<{ p: { rating: number; start_level: string } }>(SIGNED, `select public.save_profile($1) as p`, [JSON.stringify({ name: 'Rina', startLevel: 'advanced' })]);
    expect(prof!.p).toMatchObject({ rating: 1600, start_level: 'advanced' });

    const payload = { settings: { ...DEFAULT_SETTINGS, name: 'Claim test', format: 'singles' }, hostPlayer: { id: 'h2', name: 'Dimas' } };
    const [row] = await as<{ r: { id: string; slug: string } }>(HOST, `select public.create_session($1) as r`, [JSON.stringify(payload)]);
    const sid = row!.r.id;
    for (const [dev, id, name] of [[GUEST, 'guest1', 'Tari'], [SIGNED, 'rina', 'Rina']] as const) {
      await as(dev, `select public.open_public($1)`, [row!.r.slug]);
      await as(dev, `select public.join_session($1, $2, $3)`, [sid, id, name]);
    }
    const links = async () => (await as<{ player_id: string; user_id: string }>(HOST, `select player_id, user_id from public.player_links where session_id = $1 order by player_id`, [sid]));
    expect((await links()).map((l) => l.player_id)).toEqual(['h2', 'rina']);

    // The guest makes a ticket, then signs in to an account that already existed on another phone.
    const [tk] = await as<{ t: string }>(GUEST, `select public.start_transfer($1) as t`, [sid]);
    await fails(GUEST, `select public.finish_transfer($1)`, [tk!.t], 'sign_in_required');
    ACCOUNTS.add(ACCOUNT);
    await as(ACCOUNT, `select public.finish_transfer($1)`, [tk!.t]);
    await fails(ACCOUNT, `select public.finish_transfer($1)`, [tk!.t], 'transfer_expired');
    expect(await links()).toContainEqual({ player_id: 'guest1', user_id: ACCOUNT });
    const roles = await as<{ device_id: string; player_id: string }>(HOST, `select device_id, player_id from public.session_roles where session_id = $1 and player_id = 'guest1'`, [sid]);
    expect(roles).toEqual([{ device_id: ACCOUNT, player_id: 'guest1' }]);

    const rows = await as<{ id: number; type: string; payload: Record<string, unknown>; actor: string | null; created_at: Date }>(
      HOST, `select id, type, payload, actor, created_at from public.session_events where session_id = $1 order by id`, [sid]);
    const s = reduceSession(rows.map((r) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at.toISOString() }) as SessionEvent));
    expect(s.ignored).toEqual([]);
    expect(s.players.find((p) => p.id === 'guest1')!.deviceId).toBe(ACCOUNT);

    const [mine] = await as<{ n: number }>(ACCOUNT, `select count(*)::int as n from public.my_sessions() where id = $1`, [sid]);
    expect(mine!.n).toBe(1);
  });

  it('results: a closed session is rated once, and a moved rating makes the store refuse', async () => {
    const P1 = '00000000-0000-4000-8000-000000000021';
    const P2 = '00000000-0000-4000-8000-000000000022';
    ACCOUNTS.add(P1);
    ACCOUNTS.add(P2);
    for (const [dev, name, lvl] of [[HOST, 'Dimas', 'intermediate'], [P1, 'Rina', 'intermediate'], [P2, 'Budi', 'advanced']] as const) {
      await as(dev, `select public.save_profile($1)`, [JSON.stringify({ name, startLevel: lvl })]);
    }
    const payload = { settings: { ...DEFAULT_SETTINGS, name: 'Rated', format: 'singles' }, hostPlayer: { id: 'dimas', name: 'Dimas' } };
    const [row] = await as<{ r: { id: string; slug: string } }>(HOST, `select public.create_session($1) as r`, [JSON.stringify(payload)]);
    const sid = row!.r.id;
    for (const [dev, id, name] of [[P1, 'rina', 'Rina'], [P2, 'budi', 'Budi'], [STRANGER, 'tamu', 'Tamu']] as const) {
      await as(dev, `select public.open_public($1)`, [row!.r.slug]);
      await as(dev, `select public.join_session($1, $2, $3)`, [sid, id, name]);
    }
    await as(HOST, `select public.append_event($1, 'start', '{}')`, [sid]);
    const events = async () => {
      const rs = await as<{ id: number; type: string; payload: Record<string, unknown>; actor: string | null; created_at: Date }>(
        HOST, `select id, type, payload, actor, created_at from public.session_events where session_id = $1 order by id`, [sid]);
      return rs.map((r) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at.toISOString() }) as SessionEvent);
    };
    // The host types in every result as it comes up, then closes.
    for (let i = 0; i < 6; i++) {
      const live = reduceSession(await events()).matches.find((m) => m.status === 'live');
      if (!live) break;
      await as(HOST, `select public.append_event($1, 'record_result', $2)`, [sid, JSON.stringify({ matchId: live.id, court: live.court, gamesA: 4, gamesB: 2 })]);
    }
    await as(HOST, `select public.append_event($1, 'close', '{}')`, [sid]);

    const links = await as<{ player_id: string; user_id: string }>(HOST, `select player_id, user_id from public.player_links where session_id = $1`, [sid]);
    const userOf = new Map(links.map((l) => [l.player_id, l.user_id]));
    const read = async () => new Map((await as<{ id: string; rating: number; rated_matches: number }>(
      HOST, `select id, rating, rated_matches from public.profiles where id = any($1)`, [[HOST, P1, P2]])).map((p) => [p.id, { rating: Number(p.rating), rated: p.rated_matches }]));
    const out = processSession(await events(), (id) => userOf.get(id) ?? null, await read());
    expect(out.rows.length).toBe(6);
    expect(out.rows.some((r) => r.a_users.includes('') || r.b_users.includes(''))).toBe(true);
    const apply = (o: typeof out) => as<{ r: string }>(HOST, `select public.apply_results($1, $2, $3, $4, $5) as r`,
      [sid, JSON.stringify(o.rows), JSON.stringify(o.changes), JSON.stringify(o.expected), JSON.stringify(o.final)]);

    // A rating that moved since it was read: nothing is written.
    await db.query(`update public.profiles set rating = rating + 1 where id = $1`, [P2]);
    await expect(apply(out)).rejects.toThrow('stale');
    await db.query(`update public.profiles set rating = rating - 1 where id = $1`, [P2]);

    expect((await apply(out))[0]!.r).toBe('done');
    expect((await apply(out))[0]!.r).toBe('already');
    const after = await read();
    for (const f of out.final) expect(after.get(f.user)).toEqual({ rating: f.rating, rated: f.rated });
    const [n] = await as<{ n: number }>(HOST, `select count(*)::int as n from public.match_results where session_id = $1`, [sid]);
    expect(n!.n).toBe(6);
    // Members see the session's level changes; the results table itself is closed to the app.
    await as(P1, `set role authenticated`);
    const seen = await as<{ n: number }>(P1, `select count(*)::int as n from public.rating_changes where session_id = $1`, [sid]);
    expect(seen[0]!.n).toBeGreaterThan(0);
    await expect(as(P1, `select public.apply_results($1, '[]', '[]', '[]', '[]')`, [sid])).rejects.toThrow();
    await db.exec(`reset role`);

    await as(HOST, `select public.delete_account_data($1)`, [P1]);
    const [left] = await as<{ n: number }>(HOST, `select count(*)::int as n from public.match_results where a_users @> array[$1::uuid] or b_users @> array[$1::uuid]`, [P1]);
    expect(left!.n).toBe(0);
  });

  it('auto-close ends idle sessions and locks them', async () => {
    await db.exec(`update public.sessions set last_event_at = now() - interval '4 hours'`);
    const [r] = await as<{ n: number }>(HOST, `select public.auto_close_sessions() as n`);
    expect(r!.n).toBe(1);
    await fails(HOST, `select public.append_event($1, 'skip_match', '{"matchId":"m3"}')`, [sessionId], 'session_closed');
    const [last] = await as<{ type: string; payload: { by: string } }>(HOST, `select type, payload from public.session_events order by id desc limit 1`);
    expect(last).toMatchObject({ type: 'close', payload: { by: 'auto' } });
  });
});
