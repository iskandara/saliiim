/**
 * Supabase backend. Each phone signs in anonymously; its user id is the device id.
 * Writes go through Postgres functions (supabase/migrations) that check roles and court locks.
 * While offline, events wait in a local queue and are sent in order when the phone reconnects.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CourtLock, EventBody, SessionEvent } from '../core/session';
import type { Settings } from '../core/types';
import { captchaToken as getCaptchaToken } from './turnstile';
import {
  BackendError, type Account, type Backend, type Created, type FeedbackInput, type LockResult, type MetricName, type MySession,
  type LevelChange, type Profile, type ProfileInput, type SessionFeed,
} from './backend';
import type { ProfileView } from '../core/profileView';
import { summarizeChanges } from './levels';

/** Full address to come back to after sign-in: a path in this app, or the current page. */
const back = (path?: string) => (path?.startsWith('/') ? window.location.origin + path : window.location.href);

/** A guest-to-account move waiting for sign-in to finish (Google leaves the page and comes back). */
const PENDING = 'saliiim:pending-transfer';

function toProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    name: r.name as string,
    photoUrl: (r.photo_url as string) ?? null,
    city: (r.city as string) ?? null,
    hand: (r.hand as Profile['hand']) ?? null,
    formatPref: (r.format_pref as Profile['formatPref']) ?? null,
    startLevel: r.start_level as Profile['startLevel'],
    rating: Number(r.rating),
    ratedMatches: Number(r.rated_matches),
    isPublic: r.is_public as boolean,
    showBasics: r.show_basics as boolean,
    showStats: r.show_stats as boolean,
    showH2h: r.show_h2h as boolean,
    showHistory: r.show_history as boolean,
  };
}

interface EventRow {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}

interface LockRow {
  court: number;
  match_id: string;
  device_id: string;
  heartbeat_at: string;
}

const toEvent = (r: EventRow) => ({ seq: Number(r.id), type: r.type, payload: r.payload, actor: r.actor, at: r.created_at }) as SessionEvent;
const toLock = (r: LockRow): CourtLock => ({ court: r.court, matchId: r.match_id, deviceId: r.device_id, heartbeatAt: Date.parse(r.heartbeat_at) });

function isNetworkError(message: string) {
  return /fetch|network|timeout|offline/i.test(message) || (typeof navigator !== 'undefined' && !navigator.onLine);
}

/** Pulls our exception code (e.g. "host_only") out of a Postgres error message. */
function code(message: string) {
  return message.match(/[a-z_]{4,}/)?.[0] ?? message;
}

export class SupabaseBackend implements Backend {
  mode = 'supabase' as const;
  private client: SupabaseClient;
  private me: Promise<string> | null = null;
  private queueListeners = new Set<() => void>();
  private flushing = false;

  constructor(
    url: string,
    key: string,
    private captchaKey?: string,
  ) {
    this.client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true } });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushAll());
      setInterval(() => void this.flushAll(), 5000);
    }
  }

  deviceId(): Promise<string> {
    this.me ??= (async () => {
      const { data } = await this.client.auth.getSession();
      if (data.session) return data.session.user.id;
      // If the challenge can't run (blocked script, no signal), still try without a token:
      // Supabase decides whether a token is required, so this never weakens the protection.
      let token: string | undefined;
      let captchaIssue: string | undefined;
      try {
        token = this.captchaKey ? await getCaptchaToken(this.captchaKey) : undefined;
      } catch (e) {
        token = undefined;
        captchaIssue = (e as Error).message;
      }
      const { data: signed, error } = await this.client.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined);
      if (error || !signed.user) {
        this.me = null;
        if (/captcha/i.test(error?.message ?? '')) {
          // Show the reason on screen, so it can be fixed without a debugger: Turnstile's code if the
          // challenge failed on this phone, otherwise Supabase's own words.
          throw new BackendError(`captcha_failed:${captchaIssue ?? error!.message.slice(0, 80)}`);
        }
        throw new BackendError(error?.message.includes('Anonymous') ? 'anonymous_auth_disabled' : 'sign_in_failed');
      }
      return signed.user.id;
    })();
    return this.me;
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    await this.deviceId();
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new BackendError(isNetworkError(error.message) ? 'offline' : code(error.message));
    return data as T;
  }

  createSession(settings: Settings, hostPlayer: { id: string; name: string }) {
    return this.rpc<Created>('create_session', { p_payload: { settings, hostPlayer } });
  }

  async claimHost(sessionId: string, key: string) {
    await this.rpc('claim_host', { p_session: sessionId, p_key: key });
  }

  openPublic(slug: string) {
    return this.rpc<string>('open_public', { p_slug: slug });
  }

  async join(sessionId: string, playerId: string, name: string) {
    await this.rpc('join_session', { p_session: sessionId, p_player_id: playerId, p_name: name });
  }

  async claim(sessionId: string, playerId: string) {
    await this.rpc('claim_player', { p_session: sessionId, p_player_id: playerId });
  }

  // Offline queue

  private qKey = (sessionId: string) => `saliiim:queue:${sessionId}`;

  private queued(sessionId: string): EventBody[] {
    try {
      return JSON.parse(localStorage.getItem(this.qKey(sessionId)) ?? '[]');
    } catch {
      return [];
    }
  }

  private setQueue(sessionId: string, q: EventBody[]) {
    if (q.length) localStorage.setItem(this.qKey(sessionId), JSON.stringify(q));
    else localStorage.removeItem(this.qKey(sessionId));
    this.queueListeners.forEach((l) => l());
  }

  async append(sessionId: string, body: EventBody) {
    const q = this.queued(sessionId);
    if (q.length) {
      // Keep order: anything new waits behind what is already queued.
      this.setQueue(sessionId, [...q, body]);
      void this.flush(sessionId);
      return;
    }
    try {
      await this.rpc('append_event', { p_session: sessionId, p_type: body.type, p_payload: body.payload });
    } catch (e) {
      if (e instanceof BackendError && e.code === 'offline') {
        this.setQueue(sessionId, [body]);
        return;
      }
      throw e;
    }
  }

  private async flushAll() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('saliiim:queue:')) await this.flush(k.slice('saliiim:queue:'.length));
    }
  }

  private async flush(sessionId: string) {
    if (this.flushing) return;
    this.flushing = true;
    try {
      let q = this.queued(sessionId);
      while (q.length) {
        const [next, ...rest] = q;
        try {
          await this.rpc('append_event', { p_session: sessionId, p_type: next!.type, p_payload: next!.payload });
        } catch (e) {
          if (e instanceof BackendError && e.code === 'offline') return;
          // The server refused it (for example someone else took over the court): drop it and say so.
          window.dispatchEvent(new CustomEvent('saliiim:dropped', { detail: { type: next!.type, code: (e as Error).message } }));
        }
        q = rest;
        this.setQueue(sessionId, q);
      }
    } finally {
      this.flushing = false;
    }
  }

  // Accounts

  async account(): Promise<Account | null> {
    const { data } = await this.client.auth.getSession();
    const u = data.session?.user;
    if (!u || u.is_anonymous) return null;
    const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
    return {
      id: u.id,
      email: u.email ?? null,
      name: meta.full_name || meta.name || (u.email ? u.email.split('@')[0]! : ''),
      avatarUrl: meta.avatar_url || meta.picture || null,
    };
  }

  /** While still a guest: a one-time ticket that moves this phone's player in that session to the account. */
  private async prepareTransfer(sessionId?: string | null) {
    try {
      localStorage.removeItem(PENDING);
    } catch {
      /* ignore */
    }
    if (!sessionId || (await this.account())) return;
    await this.flushAll();
    const token = await this.rpc<string | null>('start_transfer', { p_session: sessionId });
    if (!token) return;
    try {
      localStorage.setItem(PENDING, JSON.stringify({ token, sessionId, at: Date.now() }));
    } catch {
      /* without storage the results stay with the guest */
    }
  }

  async signInWithGoogle(transferSessionId?: string | null, returnTo?: string) {
    await this.prepareTransfer(transferSessionId);
    const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back(returnTo) } });
    if (error) throw new BackendError(error.message.includes('provider is not enabled') ? 'google_not_enabled' : 'sign_in_failed');
  }

  async sendEmailCode(email: string, transferSessionId?: string | null, returnTo?: string) {
    await this.prepareTransfer(transferSessionId);
    let captchaToken: string | undefined;
    try {
      captchaToken = this.captchaKey ? await getCaptchaToken(this.captchaKey) : undefined;
    } catch {
      captchaToken = undefined;
    }
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: back(returnTo), captchaToken },
    });
    if (error) {
      const m = error.message.toLowerCase();
      throw new BackendError(m.includes('rate') ? 'email_rate_limited' : m.includes('invalid') ? 'bad_email' : 'email_failed');
    }
  }

  async verifyEmailCode(email: string, code: string) {
    const { error } = await this.client.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    if (error) throw new BackendError(error.message.toLowerCase().includes('expired') ? 'code_expired' : 'bad_code');
    this.me = null;
  }

  async finishSignIn(): Promise<string | null> {
    if (!(await this.account())) return null;
    let pending: { token: string; sessionId: string } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING) ?? 'null');
      localStorage.removeItem(PENDING);
    } catch {
      pending = null;
    }
    if (!pending) return null;
    try {
      this.me = null;
      await this.rpc('finish_transfer', { p_token: pending.token });
      return pending.sessionId;
    } catch {
      // Expired or already used: the session stays with the guest, nothing else is affected.
      return null;
    }
  }

  async signOut() {
    await this.client.auth.signOut();
    this.me = null;
  }

  async myProfile() {
    const row = await this.rpc<Record<string, unknown> | null>('my_profile', {});
    return row ? toProfile(row) : null;
  }

  async saveProfile(input: ProfileInput) {
    return toProfile(await this.rpc<Record<string, unknown>>('save_profile', { p: input }));
  }

  async mySessions(): Promise<MySession[]> {
    const rows = await this.rpc<Record<string, string>[]>('my_sessions', {});
    return (rows ?? []).map((r) => ({
      id: r.id!, slug: r.slug!, name: r.name ?? '', role: r.role as MySession['role'], status: r.status as MySession['status'], createdAt: r.created_at!,
    }));
  }

  private async authHeader(): Promise<Record<string, string>> {
    const { data } = await this.client.auth.getSession();
    return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async profileView(userId: string): Promise<ProfileView | null> {
    const res = await fetch(`/api/profile/${encodeURIComponent(userId)}`, { headers: await this.authHeader() }).catch(() => null);
    if (!res) throw new BackendError('offline');
    if (res.status === 404) return null;
    if (!res.ok) throw new BackendError(res.status === 503 ? 'not_configured' : 'server_error');
    return (await res.json()) as ProfileView;
  }

  requestProcessing(sessionId: string) {
    void fetch('/api/process', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) }).catch(() => undefined);
  }

  async levelChanges(sessionId: string): Promise<LevelChange[]> {
    await this.deviceId();
    const [changes, links] = await Promise.all([
      this.client.from('rating_changes').select('user_id,before,after,ord').eq('session_id', sessionId).order('ord'),
      this.client.from('player_links').select('player_id,user_id').eq('session_id', sessionId),
    ]);
    if (changes.error || links.error) return [];
    return summarizeChanges(
      (changes.data ?? []).map((c) => ({ user: c.user_id as string, before: Number(c.before), after: Number(c.after) })),
      new Map((links.data ?? []).map((l) => [l.user_id as string, l.player_id as string])),
    );
  }

  async deleteAccount() {
    const res = await fetch('/api/delete-account', { method: 'POST', headers: await this.authHeader() }).catch(() => null);
    if (!res?.ok) throw new BackendError(res ? 'server_error' : 'offline');
    await this.signOut();
  }

  async sendFeedback(input: FeedbackInput) {
    await this.rpc('submit_feedback', { p: input });
  }

  track(name: MetricName, sessionId?: string | null) {
    void this.deviceId()
      .then(() => this.client.rpc('track_event', { p_name: name, p_session: sessionId ?? null }))
      .catch(() => undefined);
  }

  // Locks

  async acquireLock(sessionId: string, court: number, matchId: string, force: boolean) {
    return this.rpc<LockResult>('acquire_lock', { p_session: sessionId, p_court: court, p_match_id: matchId, p_force: force });
  }

  async heartbeat(sessionId: string, court: number) {
    await this.rpc('heartbeat_lock', { p_session: sessionId, p_court: court }).catch(() => undefined);
  }

  async releaseLock(sessionId: string, court: number) {
    await this.rpc('release_lock', { p_session: sessionId, p_court: court }).catch(() => undefined);
  }

  // Live feed

  subscribe(sessionId: string, cb: (feed: SessionFeed) => void) {
    let events: SessionEvent[] = [];
    let locks: CourtLock[] = [];
    let ready = false;
    let error: string | null = null;
    let closed = false;
    let lastId = 0;

    const send = () => {
      if (closed) return;
      const pending = this.queued(sessionId).map(
        (b, i) => ({ ...b, seq: lastId + i + 1, actor: null, at: new Date().toISOString(), pending: true }) as SessionEvent,
      );
      cb({ events: pending.length ? [...events, ...pending] : events, locks, ready, error });
    };

    const add = (rows: EventRow[]) => {
      const seen = new Set(events.map((e) => e.seq));
      const fresh = rows.filter((r) => !seen.has(Number(r.id))).map(toEvent);
      if (!fresh.length) return;
      events = [...events, ...fresh].sort((a, b) => a.seq - b.seq);
      lastId = events.at(-1)!.seq;
    };

    const loadEvents = async () => {
      await this.deviceId();
      for (;;) {
        const { data, error: e } = await this.client
          .from('session_events')
          .select('id,type,payload,actor,created_at')
          .eq('session_id', sessionId)
          .gt('id', lastId)
          .order('id')
          .limit(1000);
        if (e) {
          error = isNetworkError(e.message) ? 'offline' : code(e.message);
          break;
        }
        error = null;
        add((data ?? []) as EventRow[]);
        if (!data || data.length < 1000) break;
      }
      if (!events.length && !error) error = 'not_found';
      ready = true;
      send();
    };

    const loadLocks = async () => {
      const { data } = await this.client.from('court_locks').select('court,match_id,device_id,heartbeat_at').eq('session_id', sessionId);
      if (data) locks = (data as LockRow[]).map(toLock);
      send();
    };

    const channel = this.client
      .channel(`session:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_events', filter: `session_id=eq.${sessionId}` }, (msg) => {
        add([msg.new as EventRow]);
        send();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_locks', filter: `session_id=eq.${sessionId}` }, () => void loadLocks())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadEvents().then(loadLocks);
      });

    void this.deviceId().then(loadEvents).then(loadLocks).catch((e: Error) => {
      error = e.message;
      ready = true;
      send();
    });
    // Safety net for missed realtime messages.
    const timer = setInterval(() => void loadEvents().then(loadLocks), 20_000);
    const onQueue = () => send();
    this.queueListeners.add(onQueue);

    return () => {
      closed = true;
      clearInterval(timer);
      this.queueListeners.delete(onQueue);
      void this.client.removeChannel(channel);
    };
  }
}
