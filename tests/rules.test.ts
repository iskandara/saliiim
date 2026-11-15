import { describe, expect, it } from 'vitest';
import { buildOrder, currentServer, setServer } from '../src/core/serve';
import { buildSchedule, emptyStats, pairingKey, roundRobin, rotatingRounds, usableCourts } from '../src/core/scheduler';
import { rank } from '../src/core/standings';

describe('serve rotation', () => {
  it('doubles order: server, opponent, partner, other opponent', () => {
    expect(buildOrder('dimas', ['dimas', 'sari'], ['maya', 'fajar'])).toEqual(['dimas', 'maya', 'sari', 'fajar']);
  });

  it('rotates each game and rebuilds from a new server', () => {
    const a = ['dimas', 'sari'];
    const b = ['maya', 'fajar'];
    const serve = setServer(null, 'dimas', 0, a, b);
    expect([0, 1, 2, 3, 4].map((slot) => currentServer(serve, slot))).toEqual(['dimas', 'maya', 'sari', 'fajar', 'dimas']);
    const changed = setServer(serve, 'fajar', 2, a, b);
    expect(currentServer(changed, 2)).toBe('fajar');
    expect(currentServer(changed, 3)).toBe('dimas');
    expect(currentServer(changed, 4)).toBe('maya');
  });

  it('singles alternates', () => {
    const serve = setServer(null, 'b', 0, ['a'], ['b']);
    expect([0, 1, 2].map((s) => currentServer(serve, s))).toEqual(['b', 'a', 'b']);
  });
});

describe('scheduler', () => {
  it('round robin plays every pairing once', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd']);
    expect(rounds).toHaveLength(3);
    const keys = rounds.flat().map(([x, y]) => pairingKey(x, y));
    expect(new Set(keys).size).toBe(6);
  });

  it('odd round robin gives each unit one bye', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd', 'e']);
    expect(rounds).toHaveLength(5);
    expect(rounds.flat()).toHaveLength(10);
    for (const r of rounds) expect(r).toHaveLength(2);
  });

  it('rotating doubles spreads partners and games', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const stats = emptyStats();
    const matches = rotatingRounds(players, 7, 1, stats);
    expect(matches).toHaveLength(14);
    for (const p of players) expect(stats.played.get(p)).toBe(7);
    const repeats = [...stats.partners.values()].filter((n) => n > 1).length;
    expect(repeats).toBeLessThanOrEqual(4);
  });

  it('rotating doubles with 6 players rests 2 each round, fairly', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const stats = emptyStats();
    rotatingRounds(players, 6, 1, stats);
    const counts = players.map((p) => stats.played.get(p) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('7 players on 2 courts: spare court gets a singles match so both courts are used', () => {
    const units = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id) => ({ id, players: [id] }));
    const specs = buildSchedule({ settings: { format: 'doubles', partnerMode: 'rotate', maxRounds: 3, courts: 2, spareCourts: 'singles' }, units, startRound: 1 });
    for (const round of [1, 2, 3]) {
      const ms = specs.filter((m) => m.round === round);
      expect(ms.map((m) => m.a.length + m.b.length).sort()).toEqual([2, 4]);
      expect(new Set(ms.flatMap((m) => [...m.a, ...m.b])).size).toBe(6);
    }
  });

  it('sessions created before the spare-court option keep their original schedule', () => {
    const units = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id) => ({ id, players: [id] }));
    const old = buildSchedule({ settings: { format: 'doubles', partnerMode: 'rotate', maxRounds: 3, courts: 2 }, units, startRound: 1 });
    expect(old).toHaveLength(3);
    expect(old.every((m) => m.a.length === 2)).toBe(true);
  });

  it('usable courts reflects how many matches can run at once', () => {
    const base = { format: 'doubles' as const, partnerMode: 'rotate' as const, courts: 2 };
    expect(usableCourts({ ...base, spareCourts: 'empty' }, 7)).toBe(1);
    expect(usableCourts({ ...base, spareCourts: 'singles' }, 7)).toBe(2);
    expect(usableCourts({ ...base, spareCourts: 'singles' }, 5)).toBe(1);
    expect(usableCourts({ ...base, partnerMode: 'fixed' }, 6)).toBe(1);
    expect(usableCourts({ format: 'singles', partnerMode: 'rotate', courts: 3 }, 5)).toBe(2);
  });

  it('regeneration skips pairings already played', () => {
    const units = ['a', 'b', 'c', 'd'].map((id) => ({ id, players: [id] }));
    const played = new Set([pairingKey('a', 'b'), pairingKey('c', 'd')]);
    const specs = buildSchedule({ settings: { format: 'singles', partnerMode: 'fixed', maxRounds: null }, units, startRound: 2, playedKeys: played });
    expect(specs).toHaveLength(4);
    expect(specs.every((m) => m.round >= 2)).toBe(true);
  });

  it('max rounds caps the schedule', () => {
    const units = ['a', 'b', 'c', 'd'].map((id) => ({ id, players: [id] }));
    const specs = buildSchedule({ settings: { format: 'singles', partnerMode: 'fixed', maxRounds: 1 }, units, startRound: 1 });
    expect(specs).toHaveLength(2);
  });
});

describe('standings', () => {
  it('ranks by win rate, so fewer matches is not a penalty', () => {
    const table = rank(['x', 'y'], [
      { unit: 'x', win: true, gamesFor: 4, gamesAgainst: 2 },
      { unit: 'x', win: true, gamesFor: 4, gamesAgainst: 3 },
      { unit: 'x', win: false, gamesFor: 1, gamesAgainst: 4 },
      { unit: 'y', win: true, gamesFor: 4, gamesAgainst: 0 },
      { unit: 'y', win: true, gamesFor: 4, gamesAgainst: 1 },
    ]);
    expect(table.map((s) => s.unit)).toEqual(['y', 'x']);
    expect(table[1]).toMatchObject({ played: 3, wins: 2, gamesWon: 9, gamesLost: 9, gameDiff: 0 });
  });

  it('breaks ties with game difference per match, then games won', () => {
    const table = rank(['x', 'y'], [
      { unit: 'x', win: true, gamesFor: 4, gamesAgainst: 3 },
      { unit: 'y', win: true, gamesFor: 4, gamesAgainst: 0 },
    ]);
    expect(table[0]!.unit).toBe('y');
  });
});
