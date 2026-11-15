import { describe, expect, it } from 'vitest';
import {
  canAppend, canConfirm, liveMatchOnCourt, playerStatus, reduceSession, roleOf, standings, startProblem,
  type EventBody, type SessionEvent,
} from '../src/core/session';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types';

function log(settings: Partial<Settings>, names: string[]) {
  const events: SessionEvent[] = [];
  const push = (body: EventBody, actor: string | null = 'host-dev') => {
    events.push({ ...body, seq: events.length + 1, actor, at: new Date(2026, 10, 15, 9, 0, events.length).toISOString() } as SessionEvent);
    return reduceSession(events);
  };
  const s: Settings = { ...DEFAULT_SETTINGS, name: 'Saturday', hostName: names[0]!, ...settings };
  push({ type: 'create', payload: { settings: s, hostPlayer: { id: names[0]!, name: names[0]! }, slug: 'slug1' } });
  for (const n of names.slice(1)) push({ type: 'add_player', payload: { id: n, name: n, via: 'manual' } });
  return { events, push };
}

const winGame = (push: (b: EventBody) => unknown, matchId: string, court: number, team: 0 | 1) => {
  for (let i = 0; i < 4; i++) push({ type: 'point', payload: { matchId, court, team } });
};

describe('session flow', () => {
  it('fixed doubles: start, fill courts, play, confirm, rank', () => {
    const { push } = log({ partnerMode: 'fixed', courts: 2, rules: { ...DEFAULT_SETTINGS.rules, deuce: 'no_ad' } }, ['dimas', 'sari', 'bayu', 'andre', 'putri', 'kevin', 'maya', 'fajar']);
    let s = push({ type: 'set_pairs', payload: { pairs: [['dimas', 'sari'], ['bayu', 'andre'], ['putri', 'kevin'], ['maya', 'fajar']] } });
    s = push({ type: 'start', payload: {} });
    expect(s.status).toBe('live');
    expect(s.matches).toHaveLength(6);
    const c1 = liveMatchOnCourt(s, 1)!;
    const c2 = liveMatchOnCourt(s, 2)!;
    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();
    expect(new Set([...c1.a, ...c1.b, ...c2.a, ...c2.b]).size).toBe(8);

    for (let g = 0; g < 4; g++) winGame(push, c1.id, 1, 0);
    s = push({ type: 'confirm', payload: { matchId: c1.id, court: 1 } });
    const done = s.matches.find((m) => m.id === c1.id)!;
    expect(done.status).toBe('done');
    expect(done.result).toMatchObject({ gamesA: 4, gamesB: 0, winner: 0 });
    expect(liveMatchOnCourt(s, 1)?.id).not.toBe(c1.id);
    const table = standings(s);
    expect(table[0]!.unit).toBe(c1.unitA);
    expect(table[0]!.wins).toBe(1);
  });

  it('7 players, 2 courts, rotating doubles: both courts start at once', () => {
    const { push } = log({ courts: 2, spareCourts: 'singles' }, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const s = push({ type: 'start', payload: {} });
    const c1 = liveMatchOnCourt(s, 1)!;
    const c2 = liveMatchOnCourt(s, 2)!;
    expect(c1.a.length).toBe(2);
    expect(c2.a.length).toBe(1);
    expect(new Set([...c1.a, ...c1.b, ...c2.a, ...c2.b]).size).toBe(6);
    // Singles results count in the per-player standings.
    expect(standings(s)).toHaveLength(7);
  });

  it('points after the winning point are ignored until confirm', () => {
    const { push } = log({ format: 'singles', rules: { ...DEFAULT_SETTINGS.rules, deuce: 'no_ad' } }, ['a', 'b']);
    let s = push({ type: 'start', payload: {} });
    const m = liveMatchOnCourt(s, 1)!;
    for (let g = 0; g < 4; g++) winGame(push, m.id, 1, 1);
    s = push({ type: 'point', payload: { matchId: m.id, court: 1, team: 0 } });
    expect(s.matches[0]!.status).toBe('pending');
    expect(s.ignored.at(-1)?.reason).toBe('match_point_pending');
    s = push({ type: 'undo', payload: { matchId: m.id, court: 1 } });
    expect(s.matches[0]!.status).toBe('live');
  });

  it('blocks start with an odd number in fixed pairs', () => {
    const { push } = log({ partnerMode: 'fixed' }, ['a', 'b', 'c', 'd', 'e']);
    const s = push({ type: 'start', payload: {} });
    expect(startProblem(s)).toBe('odd_fixed');
    expect(s.status).toBe('draft');
  });

  it('a leaver mid-match: award gives the match to the other side and the queue is rebuilt', () => {
    const { push } = log({ format: 'singles' }, ['a', 'b', 'c', 'd']);
    let s = push({ type: 'start', payload: {} });
    const m = liveMatchOnCourt(s, 1)!;
    const leaver = m.a[0]!;
    s = push({ type: 'mark_left', payload: { playerId: leaver, live: 'award' } });
    const after = s.matches.find((x) => x.id === m.id)!;
    expect(after.status).toBe('done');
    expect(after.result?.winner).toBe(1);
    expect(after.result?.reason).toBe('awarded');
    expect(s.matches.filter((x) => x.status === 'queued').every((x) => ![...x.a, ...x.b].includes(leaver))).toBe(true);
    expect(playerStatus(s, leaver).kind).toBe('left');
  });

  it('fixed pairs: a stranded partner pairs up with a late arrival', () => {
    const { push } = log({ partnerMode: 'fixed' }, ['a', 'b', 'c', 'd']);
    push({ type: 'start', payload: {} });
    push({ type: 'mark_left', payload: { playerId: 'a', live: 'skip' } });
    const s = push({ type: 'add_late', payload: { id: 'e', name: 'e' } });
    const active = s.pairs.filter((p) => p.active).map((p) => [...p.players].sort().join('+'));
    expect(active).toContain('b+e');
    expect(s.matches.some((m) => m.status === 'live')).toBe(true);
  });

  it('host edits a result and it is logged', () => {
    const { push } = log({ format: 'singles', rules: { ...DEFAULT_SETTINGS.rules, deuce: 'no_ad' } }, ['a', 'b']);
    push({ type: 'start', payload: {} });
    for (let g = 0; g < 4; g++) winGame(push, 'm1', 1, 0);
    push({ type: 'confirm', payload: { matchId: 'm1', court: 1 } });
    const s = push({ type: 'edit_result', payload: { matchId: 'm1', gamesA: 4, gamesB: 2 } });
    expect(s.matches[0]!.result).toMatchObject({ gamesA: 4, gamesB: 2, reason: 'edited' });
    expect(s.edits).toHaveLength(1);
  });

  it('host types in a final score: the match counts straight away', () => {
    const { push } = log({ format: 'singles' }, ['a', 'b']);
    push({ type: 'start', payload: {} });
    const s = push({ type: 'record_result', payload: { matchId: 'm1', court: 1, gamesA: 4, gamesB: 2 } });
    expect(s.matches[0]).toMatchObject({ status: 'done', result: { gamesA: 4, gamesB: 2, winner: 0, reason: 'entered' } });
    expect(standings(s)[0]!.unit).toBe('a');
  });

  it('a player types in a final score: it waits for the other team, and undo takes it back', () => {
    const { push } = log({ format: 'singles', scorerMode: 'players' }, ['h', 'a', 'b']);
    push({ type: 'claim', payload: { playerId: 'a', deviceId: 'dev-a' } }, null);
    push({ type: 'start', payload: {} });
    const enter = { type: 'record_result' as const, payload: { matchId: 'm1', court: 1, gamesA: 1, gamesB: 4 } };
    let s = push(enter, 'dev-a');
    expect(s.matches[0]).toMatchObject({ status: 'pending', entered: { gamesA: 1, gamesB: 4 } });
    s = push({ type: 'point', payload: { matchId: 'm1', court: 1, team: 0 } }, 'dev-a');
    expect(s.ignored.at(-1)?.reason).toBe('match_point_pending');
    s = push({ type: 'undo', payload: { matchId: 'm1', court: 1 } }, 'dev-a');
    expect(s.matches[0]).toMatchObject({ status: 'live', entered: null });
    push(enter, 'dev-a');
    s = push({ type: 'confirm', payload: { matchId: 'm1', court: 1 } }, 'dev-b');
    expect(s.matches[0]!.result).toMatchObject({ gamesA: 1, gamesB: 4, winner: 1, reason: 'entered' });
  });

  it('rejects a tied or impossible typed-in score', () => {
    const { push } = log({ format: 'singles' }, ['a', 'b']);
    push({ type: 'start', payload: {} });
    let s = push({ type: 'record_result', payload: { matchId: 'm1', court: 1, gamesA: 3, gamesB: 3 } });
    expect(s.ignored.at(-1)?.reason).toBe('bad_score');
    s = push({ type: 'record_result', payload: { matchId: 'm1', court: 1, gamesA: 4, gamesB: -1 } });
    expect(s.ignored.at(-1)?.reason).toBe('bad_score');
    expect(s.matches[0]!.status).toBe('live');
  });

  it('a skipped match can be put back at the front of the queue', () => {
    const { push } = log({ format: 'singles' }, ['a', 'b', 'c', 'd']);
    push({ type: 'start', payload: {} });
    let s = push({ type: 'skip_match', payload: { matchId: 'm1' } });
    expect(s.matches.find((m) => m.id === 'm1')!.status).toBe('skipped');
    s = push({ type: 'unskip_match', payload: { matchId: 'm1' } });
    expect(s.matches.find((m) => m.id === 'm1')!.status).toBe('queued');
    expect(s.matches.find((m) => m.status === 'queued')!.id).toBe('m1');
  });

  it('closing skips the queue and locks the log', () => {
    const { push } = log({ format: 'singles' }, ['a', 'b', 'c']);
    push({ type: 'start', payload: {} });
    let s = push({ type: 'close', payload: { by: 'auto' } });
    expect(s.status).toBe('closed');
    expect(s.matches.every((m) => m.status === 'skipped')).toBe(true);
    expect(s.closedBy).toBe('auto');
    s = push({ type: 'add_late', payload: { id: 'z', name: 'z' } });
    expect(s.ignored.at(-1)?.reason).toBe('closed');
  });

  it('step off: host matches skipped, scoring handed to players, notice raised', () => {
    const { push } = log({ format: 'singles' }, ['host', 'b', 'c']);
    push({ type: 'start', payload: {} });
    const s = push({ type: 'step_off', payload: { live: 'skip' } });
    expect(s.settings.scorerMode).toBe('players');
    expect(s.notices[0]?.kind).toBe('host_stepped_off');
    expect(s.matches.filter((m) => m.status === 'queued' || m.status === 'live').every((m) => ![...m.a, ...m.b].includes('host'))).toBe(true);
  });
});

describe('permissions', () => {
  it('only hosts send host events; points need the court lock; confirm comes from the other team', () => {
    const { push } = log({ format: 'singles', scorerMode: 'players', rules: { ...DEFAULT_SETTINGS.rules, deuce: 'no_ad' } }, ['h', 'a', 'b']);
    push({ type: 'claim', payload: { playerId: 'b', deviceId: 'dev-b' } }, null);
    push({ type: 'claim', payload: { playerId: 'a', deviceId: 'dev-a' } }, null);
    let s = push({ type: 'start', payload: {} });
    expect(roleOf(s, 'dev-b')).toBe('player');
    expect(roleOf(s, 'stranger')).toBe('spectator');
    expect(canAppend(s, 'dev-b', 'skip_match', {}, [])).toBe('host_only');
    expect(canAppend(s, 'dev-b', 'point', { court: 1, matchId: 'm1' }, [])).toBe('no_lock');
    const lock = [{ court: 1, matchId: 'm1', deviceId: 'dev-b', heartbeatAt: 0 }];
    expect(canAppend(s, 'dev-b', 'point', { court: 1, matchId: 'm1' }, lock)).toBeNull();

    for (let g = 0; g < 4; g++) winGame(push, 'm1', 1, 1);
    s = push({ type: 'claim', payload: { playerId: 'b', deviceId: 'dev-b' } }, null);
    const m = s.matches[0]!;
    expect([...m.a, ...m.b].sort()).toEqual(['a', 'b']);
    expect(m.status).toBe('pending');
    expect(canConfirm(s, 'dev-b', m, 'dev-b')).toBe(false);
    expect(canConfirm(s, 'dev-a', m, 'dev-b')).toBe(true);
    expect(canAppend(s, 'dev-b', 'confirm', { court: 1 }, lock)).toBe('cannot_confirm');
    expect(canAppend(s, 'dev-a', 'confirm', { court: 1 }, lock)).toBeNull();
    // Typing in a final score: hosts always, players only from the phone holding the court.
    expect(canAppend(s, 'host-dev', 'record_result', { court: 1, matchId: 'm1' }, [])).toBeNull();
    expect(canAppend(s, 'dev-a', 'record_result', { court: 1, matchId: 'm1' }, lock)).toBe('no_lock');
    expect(canAppend(s, 'dev-b', 'record_result', { court: 1, matchId: 'm1' }, lock)).toBeNull();
  });
});
