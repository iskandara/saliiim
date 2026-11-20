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

/** Anonymous product counters for the PRD's success metrics. No device or person is stored with them. */
/** What the feedback form sends. A rating or a message is required. */
export interface FeedbackInput {
  rating: number | null;
  kind: 'bug' | 'idea' | 'other';
  message: string;
  contact: string;
  source: 'summary' | 'page';
  lang: 'en' | 'jksl';
  sessionId: string | null;
}

export type MetricName = 'app_installed' | 'sticker_downloaded' | 'public_link_copied' | 'host_link_copied' | 'session_repeated' | 'link_pasted';

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
  /** Fire and forget: a failed count never interrupts the user. */
  track(name: MetricName, sessionId?: string | null): void;
  sendFeedback(input: FeedbackInput): Promise<void>;
}

export class BackendError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
