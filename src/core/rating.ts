/**
 * The level (M2 spec, "Rating"): an Elo-style rating shown as rating / 400, from 1.0 to 7.0.
 * Pure functions: the results Worker and demo mode both use these, so the numbers never differ.
 */
import type { StartLevel } from '../state/backend';

export const START_RATING: Record<StartLevel, number> = { beginner: 800, intermediate: 1200, advanced: 1600, competitive: 2000 };
/** A guest on court counts as a new 3.0 player. */
export const GUEST_RATING = 1200;
/** Faster movement for a player's first 10 counted matches. */
export const kFor = (rated: number) => (rated < 10 ? 64 : 32);

export interface Rated {
  rating: number;
  /** Counted matches so far. */
  rated: number;
}

/** 1 for a one-game win, rising evenly to 1.5 for a whitewash, never higher. */
export function marginBonus(gamesA: number, gamesB: number, gamesTo: number): number {
  const d = Math.abs(gamesA - gamesB);
  if (gamesTo <= 1) return 1;
  return Math.min(1.5, Math.max(1, 1 + (0.5 * (d - 1)) / (gamesTo - 1)));
}

export const expected = (me: number, opp: number) => 1 / (1 + 10 ** ((opp - me) / 400));

export interface RatingChange {
  user: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * One match. Sides list each player's account id, or null for a guest. A side's rating is the
 * average of its players; partners gain or lose the same amount, using the average of their K.
 * Any guest on court halves the change.
 */
export function rateMatch(
  m: { a: (string | null)[]; b: (string | null)[]; gamesA: number; gamesB: number; gamesTo: number },
  get: (user: string) => Rated,
): RatingChange[] {
  const sides = [m.a, m.b];
  if (!sides.flat().some(Boolean)) return [];
  const ratingOf = (side: (string | null)[]) => side.reduce((sum, u) => sum + (u ? get(u).rating : GUEST_RATING), 0) / side.length;
  const R = sides.map(ratingOf);
  const weight = sides.flat().some((u) => !u) ? 0.5 : 1;
  const M = marginBonus(m.gamesA, m.gamesB, m.gamesTo);
  const winner = m.gamesA > m.gamesB ? 0 : 1;
  const out: RatingChange[] = [];
  sides.forEach((side, i) => {
    const users = side.filter((u): u is string => !!u);
    if (!users.length) return;
    const K = users.reduce((sum, u) => sum + kFor(get(u).rated), 0) / users.length;
    const S = i === winner ? 1 : 0;
    const delta = Math.round(K * weight * M * (S - expected(R[i]!, R[1 - i]!)));
    for (const u of users) {
      const before = get(u).rating;
      out.push({ user: u, before, after: before + delta, delta });
    }
  });
  return out;
}

/** Rates matches in order, carrying each player's rating forward. Returns every change and the final state. */
export function rateAll(
  matches: { a: (string | null)[]; b: (string | null)[]; gamesA: number; gamesB: number; gamesTo: number }[],
  start: Map<string, Rated>,
): { changes: (RatingChange & { index: number })[]; final: Map<string, Rated> } {
  const state = new Map([...start].map(([k, v]) => [k, { ...v }]));
  const changes: (RatingChange & { index: number })[] = [];
  matches.forEach((m, index) => {
    const cs = rateMatch(m, (u) => state.get(u) ?? { rating: GUEST_RATING, rated: 0 });
    for (const c of cs) {
      const prev = state.get(c.user) ?? { rating: GUEST_RATING, rated: 0 };
      state.set(c.user, { rating: c.after, rated: prev.rated + 1 });
      changes.push({ ...c, index });
    }
  });
  return { changes, final: state };
}

export const levelOf = (rating: number) => Math.min(7, Math.max(1, rating / 400));
