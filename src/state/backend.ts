import type { CourtLock, EventBody, SessionEvent } from '../core/session';
import type { Settings } from '../core/types';

export interface Created {
  id: string;
  slug: string;
  hostKey: string;
}

export interface LockResult {
  ok: boolean;
  holder: string | null;
  stale: boolean;
}

export interface SessionFeed {
  events: SessionEvent[];
  locks: CourtLock[];
  /** False while the first load is in flight. */
  ready: boolean;
  error: string | null;
}

/**
 * Everything the screens need from a backend. Two implementations:
 * LocalBackend (this browser only, for demos) and SupabaseBackend (real multi-phone sessions).
 */
export interface Backend {
  mode: 'local' | 'supabase';
  deviceId(): Promise<string>;
  createSession(settings: Settings, hostPlayer: { id: string; name: string }): Promise<Created>;
  claimHost(sessionId: string, key: string): Promise<void>;
  /** Resolves a public slug to a session id and registers this phone as a spectator. */
  openPublic(slug: string): Promise<string>;
  join(sessionId: string, playerId: string, name: string): Promise<void>;
  claim(sessionId: string, playerId: string): Promise<void>;
  append(sessionId: string, body: EventBody): Promise<void>;
  acquireLock(sessionId: string, court: number, matchId: string, force: boolean): Promise<LockResult>;
  heartbeat(sessionId: string, court: number): Promise<void>;
  releaseLock(sessionId: string, court: number): Promise<void>;
  /** Calls back with the full event log and locks whenever either changes. */
  subscribe(sessionId: string, cb: (feed: SessionFeed) => void): () => void;
}

export class BackendError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
