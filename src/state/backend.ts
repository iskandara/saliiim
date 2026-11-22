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
/** A signed-in person (Google or email). Guests have none. */
export interface Account {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}

export type StartLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';

export interface Profile {
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  hand: 'left' | 'right' | null;
  formatPref: 'singles' | 'doubles' | 'both' | null;
  startLevel: StartLevel;
  rating: number;
  ratedMatches: number;
  isPublic: boolean;
  showBasics: boolean;
  showStats: boolean;
  showH2h: boolean;
  showHistory: boolean;
}

export type ProfileInput = Partial<Omit<Profile, 'id' | 'rating' | 'ratedMatches'>> & { name: string };

export interface MySession {
  id: string;
  slug: string;
  name: string;
  role: 'host' | 'co_host' | 'player' | 'spectator';
  status: 'draft' | 'live' | 'closed';
  createdAt: string;
}

/** Level shown to players: the rating divided by 400, kept between 1.0 and 7.0. */
export const levelOf = (rating: number) => Math.min(7, Math.max(1, rating / 400));

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

  // Accounts (M2)
  /** The signed-in account, or null for a guest. */
  account(): Promise<Account | null>;
  /**
   * Opens Google sign-in (leaves the page and comes back). With a session id, the guest's player in
   * that session moves to the account once sign-in completes.
   */
  signInWithGoogle(transferSessionId?: string | null, returnTo?: string): Promise<void>;
  /** Emails a sign-in link and a 6-digit code. */
  sendEmailCode(email: string, transferSessionId?: string | null, returnTo?: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  /** Runs after every page load: completes a pending guest-to-account move. Returns the session moved, if any. */
  finishSignIn(): Promise<string | null>;
  signOut(): Promise<void>;
  myProfile(): Promise<Profile | null>;
  saveProfile(input: ProfileInput): Promise<Profile>;
  mySessions(): Promise<MySession[]>;
}

export class BackendError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
