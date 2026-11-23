/**
 * Turns a closed session into what gets stored: one row per counted match and each account's
 * level change. Pure; the results Worker and demo mode both run it.
 */
import { rateAll, type Rated } from './rating';
import { countedMatches } from './results';
import { reduceSession, type SessionEvent } from './session';

export interface StoredRow {
  match_id: string;
  ord: number;
  session_name: string;
  format: 'singles' | 'doubles';
  games_to: number;
  a_players: string[];
  b_players: string[];
  a_names: string[];
  b_names: string[];
  /** Account per player, '' for a guest. */
  a_users: string[];
  b_users: string[];
  games_a: number;
  games_b: number;
  winner: 0 | 1;
}

export interface StoredChange {
  match_id: string;
  ord: number;
  user: string;
  before: number;
  after: number;
  delta: number;
}

export interface Processed {
  rows: StoredRow[];
  changes: StoredChange[];
  /** Ratings as read, so the store can refuse if they moved meanwhile. */
  expected: { user: string; rating: number; rated: number }[];
  final: { user: string; rating: number; rated: number }[];
}

/**
 * @param userOf  account linked to a player in this session, if any
 * @param ratings current rating of every account that has a profile; accounts without one are rated as guests
 */
export function processSession(
  events: SessionEvent[],
  userOf: (playerId: string) => string | null,
  ratings: Map<string, Rated>,
): Processed {
  const s = reduceSession(events);
  const matches = countedMatches(s);
  const rated = (id: string) => {
    const u = userOf(id);
    return u && ratings.has(u) ? u : null;
  };
  const { changes, final } = rateAll(
    matches.map((m) => ({ a: m.a.map(rated), b: m.b.map(rated), gamesA: m.gamesA, gamesB: m.gamesB, gamesTo: m.gamesTo })),
    ratings,
  );
  const involved = [...new Set(changes.map((c) => c.user))];
  return {
    rows: matches.map((m) => ({
      match_id: m.matchId,
      ord: m.ord,
      session_name: s.settings.name,
      format: m.format,
      games_to: m.gamesTo,
      a_players: m.a,
      b_players: m.b,
      a_names: m.aNames,
      b_names: m.bNames,
      a_users: m.a.map((id) => userOf(id) ?? ''),
      b_users: m.b.map((id) => userOf(id) ?? ''),
      games_a: m.gamesA,
      games_b: m.gamesB,
      winner: m.winner,
    })),
    changes: changes.map((c) => ({ match_id: matches[c.index]!.matchId, ord: matches[c.index]!.ord, user: c.user, before: c.before, after: c.after, delta: c.delta })),
    expected: involved.map((u) => ({ user: u, ...ratings.get(u)! })),
    final: involved.map((u) => ({ user: u, ...final.get(u)! })),
  };
}
