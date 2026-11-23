/**
 * Local demo backend: sessions live in this browser's localStorage and tabs stay in sync with
 * BroadcastChannel. Each tab is its own "phone" (device id in sessionStorage), so you can open
 * the host view in one tab and the public link in another. It applies the same permission
 * rules as the database (canAppend).
 */
import { canAppend, reduceSession, roleOf, type CourtLock, type EventBody, type SessionEvent } from '../core/session';
import type { Settings } from '../core/types';
import { buildProfileView, type PersonRef } from '../core/profileView';
import { processSession, type StoredChange, type StoredRow } from '../core/processSession';
import { START_RATING, type Rated } from '../core/rating';
import type { ResultRow } from '../core/stats';
import { summarizeChanges } from './levels';
import {
  BackendError, newId, type Account, type LevelChange, type Backend, type Created, type FeedbackInput, type LockResult, type MySession, type Profile,
  type ProfileInput, type SessionFeed, type StartLevel,
} from './backend';

// Demo accounts: each tab is its own phone, so accounts are kept per device id.
const ACCOUNTS = 'saliiim:local:accounts';
const PROFILES = 'saliiim:local:profiles';
/** The code every demo email "receives". */
export const DEMO_CODE = '123456';
const START: Record<StartLevel, number> = START_RATING;
// Demo results: what the Worker would store, kept in this browser.
const RESULTS = 'saliiim:local:results';
interface LocalResults {
  closedAt: string;
  rows: StoredRow[];
  changes: StoredChange[];
}

function readMap<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}
function writeMap<T>(key: string, value: Record<string, T>) {
  localStorage.setItem(key, JSON.stringify(value));
}

interface Stored {
  id: string;
  slug: string;
  hostKey: string;
  events: SessionEvent[];
  locks: CourtLock[];
}

const KEY = 'saliiim:local:sessions';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('saliiim-local') : null;
const listeners = new Set<() => void>();
channel?.addEventListener('message', () => listeners.forEach((l) => l()));
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key === KEY && listeners.forEach((l) => l()));

function load(): Record<string, Stored> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(all: Record<string, Stored>) {
  localStorage.setItem(KEY, JSON.stringify(all));
  channel?.postMessage('changed');
  listeners.forEach((l) => l());
}

function get(all: Record<string, Stored>, id: string): Stored {
  const s = all[id];
  if (!s) throw new BackendError('not_found');
  return s;
}

function device(): string {
  let id = sessionStorage.getItem('saliiim:local:device');
  if (!id) {
    id = `dev-${newId()}`;
    sessionStorage.setItem('saliiim:local:device', id);
  }
  return id;
}

function emit(s: Stored, body: EventBody, actor: string | null) {
  const seq = (s.events.at(-1)?.seq ?? 0) + 1;
  s.events.push({ ...body, seq, actor, at: new Date().toISOString() } as SessionEvent);
}

export class LocalBackend implements Backend {
  mode = 'local' as const;

  async deviceId() {
    return device();
  }

  async createSession(settings: Settings, hostPlayer: { id: string; name: string }): Promise<Created> {
    if (!(await this.account())) throw new BackendError('sign_in_required');
    const all = load();
    const s: Stored = { id: newId(), slug: newId(), hostKey: newId() + newId(), events: [], locks: [] };
    emit(s, { type: 'create', payload: { settings, hostPlayer, slug: s.slug } }, device());
    all[s.id] = s;
    save(all);
    return { id: s.id, slug: s.slug, hostKey: s.hostKey };
  }

  async claimHost(sessionId: string, key: string) {
    const all = load();
    const s = get(all, sessionId);
    if (s.hostKey !== key) throw new BackendError('bad_host_key');
    emit(s, { type: 'host_device', payload: { deviceId: device() } }, device());
    save(all);
  }

  async openPublic(slug: string) {
    const s = Object.values(load()).find((x) => x.slug === slug);
    if (!s) throw new BackendError('not_found');
    return s.id;
  }

  async join(sessionId: string, playerId: string, name: string) {
    const all = load();
    const s = get(all, sessionId);
    const state = reduceSession(s.events);
    if (state.status === 'closed') throw new BackendError('session_closed');
    if (state.players.some((p) => p.deviceId === device() && p.status !== 'removed' && p.status !== 'declined')) throw new BackendError('device_has_player');
    if (state.status === 'draft') emit(s, { type: 'add_player', payload: { id: playerId, name, via: 'link' } }, device());
    else emit(s, { type: 'join_request', payload: { id: playerId, name } }, device());
    emit(s, { type: 'claim', payload: { playerId, deviceId: device() } }, device());
    save(all);
  }

  async claim(sessionId: string, playerId: string) {
    const all = load();
    const s = get(all, sessionId);
    const state = reduceSession(s.events);
    const p = state.players.find((x) => x.id === playerId);
    if (!p) throw new BackendError('unknown_player');
    if (p.deviceId) throw new BackendError('claimed');
    if (state.players.some((x) => x.deviceId === device())) throw new BackendError('device_has_player');
    emit(s, { type: 'claim', payload: { playerId, deviceId: device() } }, device());
    save(all);
  }

  async append(sessionId: string, body: EventBody) {
    const all = load();
    const s = get(all, sessionId);
    const state = reduceSession(s.events);
    const err = canAppend(state, device(), body.type, body.payload as Record<string, unknown>, s.locks);
    if (err) throw new BackendError(err);
    emit(s, body, device());
    if (body.type === 'confirm') s.locks = s.locks.filter((l) => l.court !== body.payload.court);
    if (body.type === 'record_result' && (roleOf(state, device()) === 'host' || roleOf(state, device()) === 'co_host')) {
      s.locks = s.locks.filter((l) => l.court !== body.payload.court);
    }
    if (body.type === 'close') s.locks = [];
    save(all);
    if (body.type === 'close') this.rateLocally(s);
  }

  /** Demo stand-in for the results Worker: rate the closed session and update demo profiles. */
  private rateLocally(s: Stored) {
    const accounts = readMap<Account>(ACCOUNTS);
    const profiles = readMap<Profile>(PROFILES);
    const state = reduceSession(s.events);
    const userOf = (playerId: string) => {
      const dev = state.players.find((p) => p.id === playerId)?.deviceId;
      return dev && accounts[dev] ? dev : null;
    };
    const ratings = new Map<string, Rated>(Object.values(profiles).map((p) => [p.id, { rating: p.rating, rated: p.ratedMatches }]));
    const out = processSession(s.events, userOf, ratings);
    for (const f of out.final) {
      const p = profiles[f.user];
      if (p) profiles[f.user] = { ...p, rating: f.rating, ratedMatches: f.rated };
    }
    writeMap(PROFILES, profiles);
    const results = readMap<LocalResults>(RESULTS);
    results[s.id] = { closedAt: new Date().toISOString(), rows: out.rows, changes: out.changes };
    writeMap(RESULTS, results);
  }

  async acquireLock(sessionId: string, court: number, matchId: string, force: boolean): Promise<LockResult> {
    const all = load();
    const s = get(all, sessionId);
    const state = reduceSession(s.events);
    const role = roleOf(state, device());
    if (!(role === 'host' || role === 'co_host' || (role === 'player' && state.settings.scorerMode === 'players'))) {
      throw new BackendError('cannot_score');
    }
    const held = s.locks.find((l) => l.court === court);
    if (held && held.deviceId !== device() && held.matchId === matchId && !force) {
      return { ok: false, holder: held.deviceId, stale: Date.now() - held.heartbeatAt > 60_000 };
    }
    s.locks = s.locks.filter((l) => l.court !== court);
    s.locks.push({ court, matchId, deviceId: device(), heartbeatAt: Date.now() });
    save(all);
    return { ok: true, holder: device(), stale: false };
  }

  async heartbeat(sessionId: string, court: number) {
    const all = load();
    const s = all[sessionId];
    const lock = s?.locks.find((l) => l.court === court && l.deviceId === device());
    if (!lock) return;
    lock.heartbeatAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  async releaseLock(sessionId: string, court: number) {
    const all = load();
    const s = all[sessionId];
    if (!s) return;
    s.locks = s.locks.filter((l) => !(l.court === court && l.deviceId === device()));
    save(all);
  }

  track() {
    // Demo mode keeps no metrics.
  }

  async account(): Promise<Account | null> {
    return readMap<Account>(ACCOUNTS)[device()] ?? null;
  }

  private setAccount(a: Account) {
    const all = readMap<Account>(ACCOUNTS);
    all[device()] = a;
    writeMap(ACCOUNTS, all);
  }

  async signInWithGoogle(_transferSessionId?: string | null, returnTo?: string) {
    // Stands in for the Google page: the tab becomes an account and reloads, as after the real redirect.
    this.setAccount({ id: device(), email: 'demo@example.com', name: 'Demo Player', avatarUrl: null });
    if (returnTo) window.location.assign(returnTo);
    else window.location.reload();
  }

  async sendEmailCode(email: string) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BackendError('bad_email');
  }

  async verifyEmailCode(email: string, code: string) {
    if (code.trim() !== DEMO_CODE) throw new BackendError('bad_code');
    this.setAccount({ id: device(), email, name: email.split('@')[0]!, avatarUrl: null });
  }

  async finishSignIn() {
    // The demo account keeps the tab's own id, so nothing has to move.
    return null;
  }

  async signOut() {
    const all = readMap<Account>(ACCOUNTS);
    delete all[device()];
    writeMap(ACCOUNTS, all);
  }

  async myProfile() {
    return readMap<Profile>(PROFILES)[device()] ?? null;
  }

  async saveProfile(input: ProfileInput) {
    if (!(await this.account())) throw new BackendError('sign_in_required');
    const all = readMap<Profile>(PROFILES);
    const prev = all[device()];
    const startLevel = input.startLevel ?? prev?.startLevel ?? 'intermediate';
    const fresh = !prev || prev.ratedMatches === 0;
    const blank: Profile = {
      id: device(), name: '', photoUrl: null, city: null, hand: null, formatPref: null, isPublic: true, startLevel,
      showBasics: true, showStats: true, showH2h: true, showHistory: true, ratedMatches: 0, rating: START[startLevel],
    };
    const next: Profile = {
      ...blank, ...prev, ...input, name: input.name.trim(),
      startLevel: fresh ? startLevel : prev!.startLevel,
      rating: fresh ? START[startLevel] : prev!.rating,
    };
    all[device()] = next;
    writeMap(PROFILES, all);
    return next;
  }

  async profileView(userId: string) {
    const profiles = readMap<Profile>(PROFILES);
    const p = profiles[userId];
    if (!p) return null;
    const rows: ResultRow[] = [];
    for (const [sessionId, r] of Object.entries(readMap<LocalResults>(RESULTS))) {
      for (const row of r.rows) {
        if (![...row.a_users, ...row.b_users].includes(userId)) continue;
        rows.push({
          sessionId, sessionName: row.session_name, playedAt: r.closedAt, matchId: row.match_id, ord: row.ord, format: row.format,
          aUsers: row.a_users.map((u) => u || null), bUsers: row.b_users.map((u) => u || null), aNames: row.a_names, bNames: row.b_names,
          gamesA: row.games_a, gamesB: row.games_b, winner: row.winner,
          delta: r.changes.find((c) => c.match_id === row.match_id && c.user === userId)?.delta ?? null,
        });
      }
    }
    const people: Record<string, PersonRef> = {};
    for (const o of Object.values(profiles)) if (o.id !== userId) people[o.id] = { name: o.name, photoUrl: o.isPublic ? o.photoUrl : null, open: o.isPublic };
    return buildProfileView(p, rows, device(), people);
  }

  requestProcessing() {
    // Demo sessions are rated the moment they close.
  }

  async levelChanges(sessionId: string): Promise<LevelChange[]> {
    const r = readMap<LocalResults>(RESULTS)[sessionId];
    if (!r) return [];
    const s = load()[sessionId];
    const state = s ? reduceSession(s.events) : null;
    const playerOf = new Map((state?.players ?? []).filter((p) => p.deviceId).map((p) => [p.deviceId!, p.id]));
    return summarizeChanges([...r.changes].sort((a, b) => a.ord - b.ord), playerOf);
  }

  async deleteAccount() {
    const profiles = readMap<Profile>(PROFILES);
    delete profiles[device()];
    writeMap(PROFILES, profiles);
    await this.signOut();
  }

  async mySessions(): Promise<MySession[]> {
    if (!(await this.account())) return [];
    const me = device();
    return Object.values(load())
      .map((s) => ({ s, st: reduceSession(s.events) }))
      .filter(({ st }) => roleOf(st, me) !== 'spectator')
      .map(({ s, st }) => ({ id: s.id, slug: s.slug, name: st.settings.name, role: roleOf(st, me), status: st.status === 'empty' ? 'draft' : st.status, createdAt: st.createdAt ?? '' }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async sendFeedback(input: FeedbackInput) {
    // Demo mode keeps feedback in this browser only.
    try {
      const key = 'saliiim:local:feedback';
      const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      list.push({ ...input, at: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      /* storage blocked: nothing to keep */
    }
  }

  subscribe(sessionId: string, cb: (feed: SessionFeed) => void) {
    const push = () => {
      const s = load()[sessionId];
      cb(s ? { events: s.events, locks: s.locks, ready: true, error: null } : { events: [], locks: [], ready: true, error: 'not_found' });
    };
    listeners.add(push);
    push();
    return () => {
      listeners.delete(push);
    };
  }
}
