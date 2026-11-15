import { useCallback, useEffect, useMemo, useState } from 'react';
import { reduceSession, roleOf, myPlayer, type EventBody } from '../core/session';
import { backend } from '.';
import { BackendError, type SessionFeed } from './backend';

/** Live session for a screen: replayed state, this phone's role, and an append function. */
export function useSession(sessionId: string | null) {
  const [feed, setFeed] = useState<SessionFeed>({ events: [], locks: [], ready: false, error: null });
  const [device, setDevice] = useState<string | null>(null);

  useEffect(() => {
    backend.deviceId().then(setDevice, () => setDevice(null));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setFeed({ events: [], locks: [], ready: false, error: null });
    return backend.subscribe(sessionId, setFeed);
  }, [sessionId]);

  const state = useMemo(() => reduceSession(feed.events), [feed.events]);
  const role = roleOf(state, device);
  const me = myPlayer(state, device);

  const append = useCallback(
    async (body: EventBody) => {
      if (!sessionId) return;
      await backend.append(sessionId, body);
    },
    [sessionId],
  );

  return { state, role, me, device, locks: feed.locks, ready: feed.ready, error: feed.error, append, sessionId };
}

export type SessionCtx = ReturnType<typeof useSession>;

export function errorCode(e: unknown): string {
  return e instanceof BackendError ? e.code : e instanceof Error ? e.message : 'unknown';
}
