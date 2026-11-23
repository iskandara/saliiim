/**
 * Saliiim Worker: serves the app, and runs the server side of M2.
 *
 *   POST /api/process          {sessionId}  rate a closed session (also every 10 minutes by cron)
 *   GET  /api/profile/:id                    a profile, shaped by the owner's privacy settings
 *   POST /api/delete-account                 delete the signed-in account and its personal data
 *
 * It talks to Supabase with the secret key (SUPABASE_SECRET_KEY, a Cloudflare secret), which never
 * reaches the browser. Everything else is served from the Vite build.
 */
import { buildProfileView, type PersonRef, type ProfileRecord } from '../src/core/profileView';
import { processSession } from '../src/core/processSession';
import type { Rated } from '../src/core/rating';
import type { SessionEvent } from '../src/core/session';
import type { ResultRow } from '../src/core/stats';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY?: string;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

class Db {
  constructor(private env: Env) {}

  async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.env.SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: this.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  get<T>(table: string, query: string) {
    return this.req<T>(`/rest/v1/${table}?${query}`);
  }

  rpc<T>(fn: string, args: Record<string, unknown>) {
    return this.req<T>(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  }

  /** Every row, in pages of 1000 (the API's limit per request). */
  async all<T>(table: string, query: string): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await this.get<T[]>(table, `${query}&limit=1000&offset=${offset}`);
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }
}

/** The signed-in user behind a request's access token, or null. */
async function viewer(env: Env, req: Request): Promise<{ id: string; anonymous: boolean } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id: string; is_anonymous?: boolean };
  return { id: u.id, anonymous: !!u.is_anonymous };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function processOne(db: Db, sessionId: string): Promise<string> {
  const [session] = await db.get<{ status: string; processed_at: string | null }[]>('sessions', `id=eq.${sessionId}&select=status,processed_at`);
  if (!session) return 'not_found';
  if (session.status !== 'closed') return 'not_closed';
  if (session.processed_at) return 'already';
  const rows = await db.all<{ id: number; type: string; payload: Record<string, unknown>; actor: string | null; created_at: string }>(
    'session_events', `session_id=eq.${sessionId}&select=id,type,payload,actor,created_at&order=id.asc`);
  const events = rows.map((r) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at }) as SessionEvent);
  const links = await db.get<{ player_id: string; user_id: string }[]>('player_links', `session_id=eq.${sessionId}&select=player_id,user_id`);
  const userOf = new Map(links.map((l) => [l.player_id, l.user_id]));
  // Another session finishing at the same moment can move a shared player's rating: read again and retry.
  for (let attempt = 0; attempt < 4; attempt++) {
    const users = [...new Set(links.map((l) => l.user_id))];
    const profiles = users.length
      ? await db.get<{ id: string; rating: number; rated_matches: number }[]>('profiles', `id=in.(${users.join(',')})&select=id,rating,rated_matches`)
      : [];
    const ratings = new Map<string, Rated>(profiles.map((p) => [p.id, { rating: Number(p.rating), rated: p.rated_matches }]));
    const out = processSession(events, (id) => userOf.get(id) ?? null, ratings);
    try {
      return await db.rpc<string>('apply_results', {
        p_session: sessionId, p_rows: out.rows, p_changes: out.changes, p_expected: out.expected, p_final: out.final,
      });
    } catch (e) {
      if (!String(e).includes('stale')) throw e;
    }
  }
  return 'busy';
}

async function processPending(db: Db) {
  const pending = await db.get<{ id: string }[]>('sessions', 'status=eq.closed&processed_at=is.null&select=id&order=closed_at.asc&limit=20');
  for (const s of pending) {
    try {
      await processOne(db, s.id);
    } catch (e) {
      console.error('process failed', s.id, String(e));
    }
  }
}

interface ProfileRow {
  id: string; name: string; photo_url: string | null; city: string | null; hand: ProfileRecord['hand'];
  format_pref: ProfileRecord['formatPref']; rating: number; rated_matches: number; is_public: boolean;
  show_basics: boolean; show_stats: boolean; show_h2h: boolean; show_history: boolean;
}

async function profile(env: Env, db: Db, req: Request, id: string) {
  const [p] = await db.get<ProfileRow[]>('profiles', `id=eq.${id}&select=*`);
  if (!p) return json({ error: 'not_found' }, 404);
  const me = await viewer(env, req);
  const record: ProfileRecord = {
    id: p.id, name: p.name, photoUrl: p.photo_url, city: p.city, hand: p.hand, formatPref: p.format_pref,
    rating: Number(p.rating), ratedMatches: p.rated_matches, isPublic: p.is_public,
    showBasics: p.show_basics, showStats: p.show_stats, showH2h: p.show_h2h, showHistory: p.show_history,
  };
  if (!record.isPublic && me?.id !== id) return json(buildProfileView(record, [], me?.id ?? null, {}));
  const results = await db.all<{
    session_id: string; session_name: string; played_at: string; match_id: string; ord: number; format: 'singles' | 'doubles';
    a_users: (string | null)[]; b_users: (string | null)[]; a_names: string[]; b_names: string[]; games_a: number; games_b: number; winner: 0 | 1;
  }>('match_results', `or=(a_users.cs.{${id}},b_users.cs.{${id}})&select=*&order=played_at.desc`);
  const deltas = await db.all<{ session_id: string; match_id: string; delta: number }>('rating_changes', `user_id=eq.${id}&select=session_id,match_id,delta`);
  const deltaOf = new Map(deltas.map((d) => [`${d.session_id}|${d.match_id}`, Number(d.delta)]));
  const rows: ResultRow[] = results.map((r) => ({
    sessionId: r.session_id, sessionName: r.session_name, playedAt: r.played_at, matchId: r.match_id, ord: r.ord, format: r.format,
    aUsers: r.a_users, bUsers: r.b_users, aNames: r.a_names, bNames: r.b_names, gamesA: r.games_a, gamesB: r.games_b, winner: r.winner,
    delta: deltaOf.get(`${r.session_id}|${r.match_id}`) ?? null,
  }));
  const others = [...new Set(rows.flatMap((r) => [...r.aUsers, ...r.bUsers]).filter((u): u is string => !!u && u !== id))];
  const people: Record<string, PersonRef> = {};
  if (others.length) {
    const ps = await db.get<{ id: string; name: string; photo_url: string | null; is_public: boolean }[]>(
      'profiles', `id=in.(${others.join(',')})&select=id,name,photo_url,is_public`);
    for (const o of ps) people[o.id] = { name: o.name, photoUrl: o.is_public ? o.photo_url : null, open: o.is_public };
  }
  return json(buildProfileView(record, rows, me?.id ?? null, people));
}

async function deleteAccount(env: Env, db: Db, req: Request) {
  const me = await viewer(env, req);
  if (!me || me.anonymous) return json({ error: 'sign_in_required' }, 401);
  await db.rpc('delete_account_data', { p_user: me.id });
  await db.req(`/auth/v1/admin/users/${me.id}`, { method: 'DELETE' });
  return json({ ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.SUPABASE_SECRET_KEY) return json({ error: 'not_configured' }, 503);
    const db = new Db(env);
    try {
      if (url.pathname === '/api/process' && req.method === 'POST') {
        const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
        if (!sessionId || !uuid.test(sessionId)) return json({ error: 'bad_request' }, 400);
        return json({ result: await processOne(db, sessionId) });
      }
      const m = url.pathname.match(/^\/api\/profile\/([^/]+)$/);
      if (m && req.method === 'GET') {
        if (!uuid.test(m[1]!)) return json({ error: 'not_found' }, 404);
        return await profile(env, db, req, m[1]!);
      }
      if (url.pathname === '/api/delete-account' && req.method === 'POST') return await deleteAccount(env, db, req);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error(String(e));
      return json({ error: 'server_error' }, 500);
    }
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    if (env.SUPABASE_SECRET_KEY) ctx.waitUntil(processPending(new Db(env)));
  },
};
