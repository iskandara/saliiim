/**
 * Local demo backend: sessions live in this browser's localStorage and tabs stay in sync with
 * BroadcastChannel. Each tab is its own "phone" (device id in sessionStorage), so you can open
 * the host view in one tab and the public link in another. It applies the same permission
 * rules as the database (canAppend).
 */
import { canAppend, reduceSession, roleOf, type CourtLock, type EventBody, type SessionEvent } from '../core/session';
import type { Settings } from '../core/types';
import { BackendError, newId, type Backend, type Created, type LockResult, type SessionFeed } from './backend';

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
