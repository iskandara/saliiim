import { describe, expect, it } from 'vitest';
import { marginBonus, rateAll, rateMatch, type Rated } from '../src/core/rating';
import { countedMatches } from '../src/core/results';
import { reduceSession, type EventBody, type SessionEvent } from '../src/core/session';
import { profileStats, type ResultRow } from '../src/core/stats';
import { DEFAULT_SETTINGS } from '../src/core/types';

const at = (m: Record<string, Rated>) => (u: string) => m[u]!;
const one = (r: number) => ({ rating: r, rated: 20 });

describe('rating: the worked examples in the M2 spec', () => {
  it('3.0 beats 3.0, 4-3: +16 / -16', () => {
    const c = rateMatch({ a: ['x'], b: ['y'], gamesA: 4, gamesB: 3, gamesTo: 4 }, at({ x: one(1200), y: one(1200) }));
    expect(c.map((x) => x.delta)).toEqual([16, -16]);
  });
  it('3.0 beats 4.0, 4-1: +39 / -39', () => {
    const c = rateMatch({ a: ['x'], b: ['y'], gamesA: 4, gamesB: 1, gamesTo: 4 }, at({ x: one(1200), y: one(1600) }));
    expect(c.map((x) => [x.delta, x.after])).toEqual([[39, 1239], [-39, 1561]]);
  });
  it('doubles, team average 3.0 each side, 4-2: +19 each / -19 each', () => {
    const c = rateMatch({ a: ['p', 'q'], b: ['r', 's'], gamesA: 4, gamesB: 2, gamesTo: 4 }, at({ p: one(1400), q: one(1000), r: one(1200), s: one(1200) }));
    expect(c.map((x) => x.delta)).toEqual([19, 19, -19, -19]);
  });
  it('3.0 beats a guest 4-0: +12, guest unchanged', () => {
    const c = rateMatch({ a: ['x'], b: [null], gamesA: 4, gamesB: 0, gamesTo: 4 }, at({ x: one(1200) }));
    expect(c).toEqual([{ user: 'x', before: 1200, after: 1212, delta: 12 }]);
  });
  it('a new 2.0 beats a 3.0, 4-2: +68 / -34', () => {
    const c = rateMatch({ a: ['n'], b: ['y'], gamesA: 4, gamesB: 2, gamesTo: 4 }, at({ n: { rating: 800, rated: 0 }, y: one(1200) }));
    expect(c.map((x) => x.delta)).toEqual([68, -34]);
  });
  it('margin bonus is 1 to 1.5 and capped', () => {
    expect(marginBonus(4, 3, 4)).toBe(1);
    expect(marginBonus(4, 0, 4)).toBe(1.5);
    expect(marginBonus(8, 0, 6)).toBe(1.5);
  });
  it('rateAll carries ratings forward and counts matches', () => {
    const { changes, final } = rateAll(
      [{ a: ['x'], b: ['y'], gamesA: 4, gamesB: 3, gamesTo: 4 }, { a: ['x'], b: ['y'], gamesA: 4, gamesB: 3, gamesTo: 4 }],
      new Map([['x', { rating: 1200, rated: 0 }], ['y', { rating: 1200, rated: 0 }]]),
    );
    expect(changes).toHaveLength(4);
    // +32 at even odds, then +26 as the favourite (1232 v 1168).
    expect(final.get('x')).toEqual({ rating: 1258, rated: 2 });
  });
});

describe('counted results', () => {
  it('confirmed and host-entered count; awarded and skipped do not; order follows confirmation', () => {
    const events: SessionEvent[] = [];
    const push = (body: EventBody) => {
      events.push({ ...body, seq: events.length + 1, actor: 'host-dev', at: new Date(2026, 10, 23, 9, 0, events.length).toISOString() } as SessionEvent);
      return reduceSession(events);
    };
    push({ type: 'create', payload: { settings: { ...DEFAULT_SETTINGS, name: 'S', hostName: 'h', format: 'singles', courts: 2 }, hostPlayer: { id: 'h', name: 'H' }, slug: 's' } });
    for (const n of ['a', 'b', 'c']) push({ type: 'add_player', payload: { id: n, name: n.toUpperCase(), via: 'manual' } });
    let s = push({ type: 'start', payload: {} });
    const [c1, c2] = [1, 2].map((c) => s.matches.find((m) => m.court === c)!);
    push({ type: 'record_result', payload: { matchId: c2!.id, court: 2, gamesA: 1, gamesB: 4 } });
    push({ type: 'record_result', payload: { matchId: c1!.id, court: 1, gamesA: 4, gamesB: 2 } });
    s = push({ type: 'skip_match', payload: { matchId: s.matches.find((m) => m.status === 'live')!.id } });
    const rows = countedMatches(s);
    expect(rows.map((r) => r.matchId)).toEqual([c2!.id, c1!.id]);
    expect(rows[0]).toMatchObject({ format: 'singles', gamesTo: 4, gamesA: 1, gamesB: 4, winner: 1 });
  });
});

describe('profile stats', () => {
  const row = (o: Partial<ResultRow>): ResultRow => ({
    sessionId: 's1', sessionName: 'Sabtu', playedAt: '2026-11-20T10:00:00Z', matchId: 'm1', ord: 1, format: 'singles',
    aUsers: ['me'], bUsers: ['rival'], aNames: ['Me'], bNames: ['Rival'], gamesA: 4, gamesB: 2, winner: 0, delta: 10, ...o,
  });
  it('career, streak, head-to-head, partners and history', () => {
    const rows = [
      row({ matchId: 'm1', ord: 1 }),
      row({ matchId: 'm2', ord: 2, winner: 1, gamesA: 2, gamesB: 4, delta: -9 }),
      row({ sessionId: 's2', sessionName: 'Minggu', playedAt: '2026-11-22T10:00:00Z', matchId: 'm1', ord: 1, format: 'doubles',
        aUsers: ['pal', 'me'], bUsers: ['rival', null], aNames: ['Pal', 'Me'], bNames: ['Rival', 'Guest'] }),
      row({ sessionId: 's2', sessionName: 'Minggu', playedAt: '2026-11-22T10:00:00Z', matchId: 'm2', ord: 2, aUsers: ['x'], bUsers: ['y'] }),
    ];
    const st = profileStats(rows, 'me');
    expect(st.career).toMatchObject({ sessions: 2, matches: 3, wins: 2, losses: 1, winPct: 67, gamesWon: 10, gamesLost: 8, streak: 1 });
    expect(st.career.doubles).toEqual({ matches: 1, wins: 1 });
    expect(st.opponents).toEqual([{ user: 'rival', wins: 2, losses: 1 }]);
    expect(st.partners).toEqual([{ user: 'pal', wins: 1, losses: 0 }]);
    expect(st.toughestRival?.user).toBe('rival');
    expect(st.bestPartner).toBeNull();
    expect(st.history.map((h) => h.sessionName)).toEqual(['Minggu', 'Sabtu']);
    expect(st.history[0]!.matches[0]).toMatchObject({ partners: ['Pal'], opponents: ['Rival', 'Guest'], won: true });
  });
});
