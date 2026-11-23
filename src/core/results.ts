/**
 * The results that count toward stats and the level (M2 spec, "What counts"): confirmed on court,
 * typed in by the host, typed in by a player and confirmed, or corrected by the host afterwards.
 * Awarded, kept, skipped and unconfirmed matches don't count.
 */
import { nameOf, type SessionState } from './session';

export interface CountedMatch {
  matchId: string;
  /** Order the results were confirmed in. */
  ord: number;
  format: 'singles' | 'doubles';
  gamesTo: number;
  a: string[];
  b: string[];
  aNames: string[];
  bNames: string[];
  gamesA: number;
  gamesB: number;
  winner: 0 | 1;
}

const COUNTS = new Set(['played', 'entered', 'edited']);

export function countedMatches(s: SessionState): CountedMatch[] {
  return s.matches
    .filter((m) => m.status === 'done' && m.result && COUNTS.has(m.result.reason))
    .sort((x, y) => (x.doneSeq ?? 0) - (y.doneSeq ?? 0) || x.id.localeCompare(y.id, undefined, { numeric: true }))
    .map((m, i) => ({
      matchId: m.id,
      ord: i + 1,
      format: m.a.length > 1 ? 'doubles' : 'singles',
      gamesTo: s.settings.rules.gamesTo,
      a: m.a,
      b: m.b,
      aNames: m.a.map((id) => nameOf(s, id)),
      bNames: m.b.map((id) => nameOf(s, id)),
      gamesA: m.result!.gamesA,
      gamesB: m.result!.gamesB,
      winner: m.result!.winner,
    }));
}
