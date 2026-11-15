import type { Rules, Team } from './types';

/** Score of one match. Points are raw counts (0,1,2,3…), not 15/30/40. */
export interface ScoreState {
  games: [number, number];
  points: [number, number];
  tiebreak: boolean;
  /** Set once the winning point is played; the match then waits for Confirm. */
  winner: Team | null;
}

export const initialScore = (): ScoreState => ({
  games: [0, 0],
  points: [0, 0],
  tiebreak: false,
  winner: null,
});

function gameWon(p: number, q: number, rules: Rules): boolean {
  if (p < 4) return false;
  switch (rules.deuce) {
    case 'no_ad':
      // First to 4 points; at 3-3 the next point decides.
      return true;
    case 'one_deuce':
      // One advantage is played; back to deuce (4-4) means the next point wins.
      return p - q >= 2 || p + q >= 9;
    case 'advantage':
      return p - q >= 2;
  }
}

function tiebreakWon(p: number, q: number, rules: Rules): boolean {
  return p >= rules.tiebreakTo && p - q >= 2;
}

/** Applies one point. Points after the winning point are ignored until undo. */
export function applyPoint(state: ScoreState, team: Team, rules: Rules): ScoreState {
  if (state.winner !== null) return state;
  const other: Team = team === 0 ? 1 : 0;
  const s: ScoreState = {
    games: [state.games[0], state.games[1]],
    points: [state.points[0], state.points[1]],
    tiebreak: state.tiebreak,
    winner: null,
  };
  s.points[team] += 1;
  const p = s.points[team];
  const q = s.points[other];

  if (s.tiebreak) {
    if (tiebreakWon(p, q, rules)) {
      s.games[team] += 1;
      s.points = [0, 0];
      s.winner = team;
    }
    return s;
  }

  if (!gameWon(p, q, rules)) return s;

  s.points = [0, 0];
  s.games[team] += 1;
  const g = s.games[team];
  const o = s.games[other];
  const n = rules.gamesTo;

  if (rules.margin === 'first_to') {
    if (g >= n) s.winner = team;
    else if (rules.tiebreak && g === n - 1 && o === n - 1) s.tiebreak = true;
  } else {
    if (g >= n && g - o >= 2) s.winner = team;
    else if (rules.tiebreak && g === n && o === n) s.tiebreak = true;
  }
  return s;
}

export type ScoreInput = { type: 'point'; team: Team } | { type: 'undo' };

/** Replays points; each undo removes the latest remaining point. */
export function replayScore(inputs: ScoreInput[], rules: Rules): { score: ScoreState; points: Team[] } {
  const points: Team[] = [];
  for (const input of inputs) {
    if (input.type === 'undo') points.pop();
    else points.push(input.team);
  }
  let score = initialScore();
  const kept: Team[] = [];
  for (const team of points) {
    if (score.winner !== null) break;
    score = applyPoint(score, team, rules);
    kept.push(team);
  }
  return { score, points: kept };
}

/** Display labels for the current game: "0", "15", "30", "40", "AD", or tiebreak numbers. */
export function pointLabels(state: ScoreState): [string, string] {
  const [a, b] = state.points;
  if (state.tiebreak) return [String(a), String(b)];
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['AD', '40'] : ['40', 'AD'];
  }
  const map = ['0', '15', '30', '40'];
  return [map[a] ?? '40', map[b] ?? '40'];
}

export type Banner = 'deuce' | 'deuce_warning' | 'deciding' | 'tiebreak' | null;

export function scoreBanner(state: ScoreState, rules: Rules): Banner {
  if (state.winner !== null) return null;
  if (state.tiebreak) return 'tiebreak';
  const [a, b] = state.points;
  if (a >= 3 && b >= 3 && a === b) {
    if (rules.deuce === 'no_ad') return 'deciding';
    if (rules.deuce === 'one_deuce') return a + b >= 8 ? 'deciding' : 'deuce_warning';
    return 'deuce';
  }
  return null;
}

/** Serve slot: advances once per game, and in a tiebreak after point 1, then every 2 points. */
export function serveSlot(state: ScoreState): number {
  const games = state.games[0] + state.games[1];
  if (!state.tiebreak) return games;
  const tb = state.points[0] + state.points[1];
  return games + Math.floor((tb + 1) / 2);
}

/** Short summary for the rules, used on setup and the scorer header. */
export function describeRules(rules: Rules): string {
  const deuce = { one_deuce: 'One deuce', advantage: 'Advantage', no_ad: 'No-ad' }[rules.deuce];
  const margin = rules.margin === 'first_to' ? `first to ${rules.gamesTo}` : `win by 2 from ${rules.gamesTo}`;
  const tbAt = rules.margin === 'first_to' ? rules.gamesTo - 1 : rules.gamesTo;
  const tb = rules.tiebreak ? `tiebreak to ${rules.tiebreakTo} at ${tbAt}-${tbAt}` : 'no tiebreak';
  return `${deuce} · ${margin} · ${tb}`;
}
