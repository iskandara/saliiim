import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backend } from '.';
import type { Account, Profile } from './backend';

export type SignInReason = 'host' | 'save' | 'claim' | 'generic';

export interface SignInRequest {
  reason: SignInReason;
  /** The session whose guest player should move to the account. */
  sessionId?: string | null;
  /** Where to land after signing in; defaults to the current page. */
  next?: string;
}

interface AccountState {
  ready: boolean;
  account: Account | null;
  profile: Profile | null;
  /** A session whose results just moved to this account, for a one-time "saved" message. */
  claimed: string | null;
  request: SignInRequest | null;
  signIn: (req?: Partial<SignInRequest>) => void;
  closeSignIn: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (p: Profile) => void;
}

const Ctx = createContext<AccountState | null>(null);

/**
 * Who is signed in. On every page load it finishes a pending guest-to-account move, and sends a
 * new account to the welcome screen before anything else.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [request, setRequest] = useState<SignInRequest | null>(null);

  const refresh = useCallback(async () => {
    try {
      const moved = await backend.finishSignIn();
      if (moved) setClaimed(moved);
      const a = await backend.account();
      setAccount(a);
      setProfile(a ? await backend.myProfile().catch(() => null) : null);
    } catch {
      setAccount(null);
      setProfile(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Sign-in redirects back with ?code=…; once handled it only clutters the address.
    const url = new URL(window.location.href);
    if (url.searchParams.has('code')) {
      url.searchParams.delete('code');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [refresh]);

  // A new account picks a name and level first.
  useEffect(() => {
    if (ready && account && !profile && pathname !== '/welcome') {
      nav(`/welcome?next=${encodeURIComponent(pathname + search)}`, { replace: true });
    }
  }, [ready, account, profile, pathname, search, nav]);

  const value: AccountState = {
    ready,
    account,
    profile,
    claimed,
    request,
    signIn: (req) => setRequest({ reason: 'generic', ...req }),
    closeSignIn: () => setRequest(null),
    refresh,
    signOut: async () => {
      await backend.signOut();
      setAccount(null);
      setProfile(null);
      // A fresh guest identity is made on the next page load.
      window.location.assign('/');
    },
    setProfile,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AccountProvider missing');
  return v;
}
