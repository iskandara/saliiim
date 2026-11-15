/**
 * Runs the Supabase migration on an in-memory Postgres (PGlite) and checks the access rules.
 * auth.uid() is stubbed to read the device id we set, like Supabase does from the JWT.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, describe, expect, it } from 'vitest';
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

async function as<T = Record<string, unknown>>(device: string, sql: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [device]);
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
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
  await db.exec(`grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;`);
});

describe('supabase migration', () => {
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

  it('only members can read the session (row level security)', async () => {
    await as(STRANGER, `set role authenticated`);
    const none = await as(STRANGER, `select count(*)::int as n from public.session_events where session_id = $1`, [sessionId]);
    expect(none[0]).toEqual({ n: 0 });
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

  it('auto-close ends idle sessions and locks them', async () => {
    await db.exec(`update public.sessions set last_event_at = now() - interval '4 hours'`);
    const [r] = await as<{ n: number }>(HOST, `select public.auto_close_sessions() as n`);
    expect(r!.n).toBe(1);
    await fails(HOST, `select public.append_event($1, 'skip_match', '{"matchId":"m3"}')`, [sessionId], 'session_closed');
    const [last] = await as<{ type: string; payload: { by: string } }>(HOST, `select type, payload from public.session_events order by id desc limit 1`);
    expect(last).toMatchObject({ type: 'close', payload: { by: 'auto' } });
  });
});
