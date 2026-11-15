import type { Settings } from './types';

/** A match before it has an id: two sides of player ids, plus the unit ids that are ranked. */
export interface MatchSpec {
  round: number;
  a: string[];
  b: string[];
  unitA: string;
  unitB: string;
}

export interface Unit {
  id: string;
  players: string[];
}

const BYE = '__bye__';
const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Circle-method round robin. Odd counts get a bye each round. */
export function roundRobin(ids: string[]): [string, string][][] {
  const list = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(BYE);
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = list[i]!;
      const y = list[n - 1 - i]!;
      if (x !== BYE && y !== BYE) pairs.push([x, y]);
    }
    rounds.push(pairs);
    const last = list.pop()!;
    list.splice(1, 0, last);
  }
  return rounds;
}

export interface RotationStats {
  played: Map<string, number>;
  partners: Map<string, number>;
  opponents: Map<string, number>;
}

export const emptyStats = (): RotationStats => ({ played: new Map(), partners: new Map(), opponents: new Map() });

function bump(map: Map<string, number>, k: string) {
  map.set(k, (map.get(k) ?? 0) + 1);
}

export function recordRotation(stats: RotationStats, a: string[], b: string[]) {
  for (const p of [...a, ...b]) bump(stats.played, p);
  if (a.length === 2) bump(stats.partners, key(a[0]!, a[1]!));
  if (b.length === 2) bump(stats.partners, key(b[0]!, b[1]!));
  for (const x of a) for (const y of b) bump(stats.opponents, key(x, y));
}

/**
 * Rotating doubles: each round, the players who have played least go on; partners are chosen
 * to avoid repeats, then pairs are matched to avoid repeat opponents. Deterministic.
 */
export function rotatingRounds(players: string[], rounds: number, startRound: number, stats: RotationStats): MatchSpec[] {
  const out: MatchSpec[] = [];
  const groups = Math.floor(players.length / 4);
  if (groups === 0) return out;
  for (let r = 0; r < rounds; r++) {
    const round = startRound + r;
    const offset = (round * 3) % players.length;
    const ordered = players
      .map((p, i) => ({ p, i: (i - offset + players.length) % players.length }))
      .sort((x, y) => (stats.played.get(x.p) ?? 0) - (stats.played.get(y.p) ?? 0) || x.i - y.i)
      .map((x) => x.p)
      .slice(0, groups * 4);

    const pairs: [string, string][] = [];
    const pool = [...ordered];
    while (pool.length >= 2) {
      const p = pool.shift()!;
      let best = 0;
      let bestScore = Infinity;
      pool.forEach((q, i) => {
        const s = stats.partners.get(key(p, q)) ?? 0;
        if (s < bestScore) {
          bestScore = s;
          best = i;
        }
      });
      const [q] = pool.splice(best, 1);
      pairs.push([p, q!]);
    }

    while (pairs.length >= 2) {
      const first = pairs.shift()!;
      let best = 0;
      let bestScore = Infinity;
      pairs.forEach((pair, i) => {
        let s = 0;
        for (const x of first) for (const y of pair) s += stats.opponents.get(key(x, y)) ?? 0;
        if (s < bestScore) {
          bestScore = s;
          best = i;
        }
      });
      const [second] = pairs.splice(best, 1);
      const a = [...first];
      const b = [...second!];
      recordRotation(stats, a, b);
      out.push({ round, a, b, unitA: a.join('+'), unitB: b.join('+') });
    }
  }
  return out;
}

export function defaultRounds(settings: Pick<Settings, 'format' | 'partnerMode'>, unitCount: number): number {
  if (settings.format === 'doubles' && settings.partnerMode === 'rotate') {
    return Math.max(3, Math.min(unitCount - 1, 8));
  }
  return unitCount % 2 === 0 ? unitCount - 1 : unitCount;
}

export interface ScheduleInput {
  settings: Pick<Settings, 'format' | 'partnerMode' | 'maxRounds'>;
  /** Players for singles and rotating doubles; pairs for fixed doubles. */
  units: Unit[];
  /** Round to number new matches from (1 for a fresh schedule). */
  startRound: number;
  /** Unit pairings already played or in play, for round robin regeneration. */
  playedKeys?: Set<string>;
  /** Partner/opponent history, for rotating doubles regeneration. */
  stats?: RotationStats;
  /** Last round to schedule. Defaults: rotating = defaultRounds, round robin = all pairings. */
  targetRounds?: number | null;
}

export const pairingKey = key;

export function isRotating(settings: Pick<Settings, 'format' | 'partnerMode'>): boolean {
  return settings.format === 'doubles' && settings.partnerMode === 'rotate';
}

export function buildSchedule(input: ScheduleInput): MatchSpec[] {
  const { settings, units, startRound } = input;
  const rotating = isRotating(settings);
  const target =
    input.targetRounds ?? settings.maxRounds ?? (rotating ? defaultRounds(settings, units.length) : Infinity);
  const remaining = target - (startRound - 1);
  if (remaining <= 0) return [];

  if (rotating) {
    return rotatingRounds(
      units.map((u) => u.id),
      remaining,
      startRound,
      input.stats ?? emptyStats(),
    );
  }

  const byId = new Map(units.map((u) => [u.id, u]));
  const played = input.playedKeys ?? new Set<string>();
  const out: MatchSpec[] = [];
  let round = startRound;
  for (const pairs of roundRobin(units.map((u) => u.id))) {
    const fresh = pairs.filter(([x, y]) => !played.has(key(x, y)));
    if (fresh.length === 0) continue;
    if (round > target) break;
    for (const [x, y] of fresh) {
      out.push({ round, a: byId.get(x)!.players, b: byId.get(y)!.players, unitA: x, unitB: y });
    }
    round++;
  }
  return out;
}

/** Rough session length, for the review sheet. */
export function estimateMinutes(matchCount: number, courts: number, gamesTo: 4 | 6): number {
  const perMatch = gamesTo === 4 ? 20 : 35;
  return Math.ceil(matchCount / Math.max(1, courts)) * perMatch;
}
