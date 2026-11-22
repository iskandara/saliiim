/**
 * Session engine: the whole session is an ordered event log. Every phone replays the same log
 * through `reduceSession`, so everyone sees the same courts, queue and standings.
 * Pure functions only: no UI, no network, no clock.
 */
import { buildSchedule, emptyStats, isRotating, defaultRounds, pairingKey, recordRotation, type Unit } from './scheduler';
import { replayScore, initialScore, serveSlot, type ScoreInput, type ScoreState } from './scoring';
import { setServer, type ServeOrder } from './serve';
import { rank, type Entry, type Standing } from './standings';
import type { Settings, Team } from './types';

export type LiveChoice = 'keep' | 'award' | 'skip';

export type EventBody =
  | { type: 'create'; payload: { settings: Settings; hostPlayer: { id: string; name: string }; slug: string } }
  | { type: 'host_device'; payload: { deviceId: string } }
  | { type: 'update_settings'; payload: { settings: Settings } }
  | { type: 'add_player'; payload: { id: string; name: string; via: 'manual' | 'link' } }
  | { type: 'remove_player'; payload: { id: string } }
  | { type: 'claim'; payload: { playerId: string; deviceId: string } }
  | { type: 'reset_claim'; payload: { playerId: string } }
  | { type: 'join_request'; payload: { id: string; name: string } }
  | { type: 'approve_join'; payload: { id: string } }
  | { type: 'decline_join'; payload: { id: string } }
  | { type: 'set_pairs'; payload: { pairs: [string, string][] } }
  | { type: 'start'; payload: Record<string, never> }
  | { type: 'add_late'; payload: { id: string; name: string } }
  | { type: 'mark_left'; payload: { playerId: string; live: LiveChoice } }
  | { type: 'step_off'; payload: { live: LiveChoice } }
  | { type: 'skip_match'; payload: { matchId: string } }
  | { type: 'unskip_match'; payload: { matchId: string } }
  | { type: 'postpone_match'; payload: { matchId: string } }
  /** Written by the server only: a guest's player moves to the account they signed in with. */
  | { type: 'rebind'; payload: { playerId: string; from: string; to: string } }
  | { type: 'point'; payload: { matchId: string; court: number; team: Team } }
  | { type: 'undo'; payload: { matchId: string; court: number } }
  | { type: 'set_server'; payload: { matchId: string; court: number; playerId: string } }
  | { type: 'confirm'; payload: { matchId: string; court: number } }
  | { type: 'edit_result'; payload: { matchId: string; gamesA: number; gamesB: number } }
  | { type: 'record_result'; payload: { matchId: string; court: number; gamesA: number; gamesB: number } }
  | { type: 'hand_scoring'; payload: Record<string, never> }
  | { type: 'promote'; payload: { playerId: string } }
  | { type: 'close'; payload: { by: 'host' | 'auto' } };

export type EventType = EventBody['type'];
export type PayloadOf<T extends EventType> = Extract<EventBody, { type: T }>['payload'];

export type SessionEvent = EventBody & {
  seq: number;
  actor: string | null;
  at: string;
  /** Written on this phone but not yet accepted by the server. */
  pending?: boolean;
};

/** Events only the host or a co-host may send. */
export const HOST_EVENTS: EventType[] = [
  'update_settings', 'add_player', 'remove_player', 'reset_claim', 'approve_join', 'decline_join',
  'set_pairs', 'start', 'add_late', 'mark_left', 'step_off', 'skip_match', 'unskip_match', 'edit_result',
  'hand_scoring', 'promote', 'close', 'postpone_match',
];
/** Events that need the court lock. */
export const SCORING_EVENTS: EventType[] = ['point', 'undo', 'set_server'];

export interface PlayerState {
  id: string;
  name: string;
  status: 'active' | 'left' | 'pending' | 'declined' | 'removed';
  via: 'host' | 'manual' | 'link' | 'late';
  deviceId: string | null;
}

export interface PairState {
  id: string;
  players: [string, string];
  active: boolean;
}

export interface MatchResult {
  gamesA: number;
  gamesB: number;
  winner: Team;
  reason: 'played' | 'awarded' | 'kept' | 'edited' | 'entered';
}

export interface MatchState {
  id: string;
  round: number;
  court: number | null;
  a: string[];
  b: string[];
  unitA: string;
  unitB: string;
  status: 'queued' | 'live' | 'pending' | 'done' | 'skipped';
  inputs: ScoreInput[];
  serve: ServeOrder | null;
  score: ScoreState;
  result: MatchResult | null;
  /** Final score typed in after the match instead of scoring live; waits for the other team's confirm. */
  entered: { gamesA: number; gamesB: number } | null;
}

export interface Notice {
  kind: 'host_stepped_off' | 'scoring_handed';
  name: string;
  seq: number;
}

export interface SessionState {
  slug: string;
  settings: Settings;
  status: 'empty' | 'draft' | 'live' | 'closed';
  players: PlayerState[];
  pairs: PairState[];
  matches: MatchState[];
  hostDevices: string[];
  cohostDevices: string[];
  /** Set once the host steps off: from then on every player in the session is a co-host. */
  openHost: boolean;
  hostPlayerId: string | null;
  notices: Notice[];
  closedBy: 'host' | 'auto' | null;
  edits: { matchId: string; seq: number; actor: string | null }[];
  targetRounds: number | null;
  nextMatchNo: number;
  nextPairNo: number;
  lastSeq: number;
  lastAt: string | null;
  createdAt: string | null;
  /** Events that broke a rule and were ignored, kept for debugging. */
  ignored: { seq: number; type: string; reason: string }[];
}

export function emptySession(): SessionState {
  return {
    slug: '',
    settings: {
      name: '', hostName: '', format: 'doubles', partnerMode: 'rotate', courts: 1, scorerMode: 'host', maxRounds: null,
      rules: { gamesTo: 4, deuce: 'one_deuce', margin: 'first_to', tiebreak: false, tiebreakTo: 7 },
    },
    status: 'empty',
    players: [],
    pairs: [],
    matches: [],
    hostDevices: [],
    cohostDevices: [],
    openHost: false,
    hostPlayerId: null,
    notices: [],
    closedBy: null,
    edits: [],
    targetRounds: null,
    nextMatchNo: 1,
    nextPairNo: 1,
    lastSeq: 0,
    lastAt: null,
    createdAt: null,
    ignored: [],
  };
}

class Ignore extends Error {}
function fail(reason: string): never {
  throw new Ignore(reason);
}

const ON_COURT = new Set(['live', 'pending']);

export function activePlayers(s: SessionState): PlayerState[] {
  return s.players.filter((p) => p.status === 'active');
}

function player(s: SessionState, id: string): PlayerState {
  return s.players.find((p) => p.id === id) ?? fail('unknown_player');
}

function match(s: SessionState, id: string): MatchState {
  return s.matches.find((m) => m.id === id) ?? fail('unknown_match');
}

function rescore(s: SessionState, m: MatchState) {
  m.score = replayScore(m.inputs, s.settings.rules).score;
  if (m.status === 'live' || m.status === 'pending') m.status = m.entered || m.score.winner !== null ? 'pending' : 'live';
}

/** Units that get ranked: pairs for fixed doubles, players otherwise. */
function scheduleUnits(s: SessionState): Unit[] {
  if (s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed') {
    return s.pairs.filter((p) => p.active).map((p) => ({ id: p.id, players: [...p.players] }));
  }
  return activePlayers(s).map((p) => ({ id: p.id, players: [p.id] }));
}

function addMatches(s: SessionState, specs: ReturnType<typeof buildSchedule>) {
  for (const spec of specs) {
    s.matches.push({
      id: `m${s.nextMatchNo++}`,
      round: spec.round,
      court: null,
      a: spec.a,
      b: spec.b,
      unitA: spec.unitA,
      unitB: spec.unitB,
      status: 'queued',
      inputs: [],
      serve: null,
      score: initialScore(),
      result: null,
      entered: null,
    });
  }
}

/** Drops the queue and rebuilds it for the players still here, keeping what was played. */
function regenerate(s: SessionState) {
  s.matches = s.matches.filter((m) => m.status !== 'queued');
  const startRound = s.matches.reduce((r, m) => Math.max(r, m.round), 0) + 1;
  const units = scheduleUnits(s);
  if (isRotating(s.settings)) {
    const stats = emptyStats();
    for (const m of s.matches) if (m.status !== 'skipped') recordRotation(stats, m.a, m.b);
    addMatches(s, buildSchedule({ settings: s.settings, units, startRound, stats, targetRounds: s.targetRounds }));
  } else {
    const playedKeys = new Set(s.matches.map((m) => pairingKey(m.unitA, m.unitB)));
    addMatches(s, buildSchedule({ settings: s.settings, units, startRound, playedKeys, targetRounds: s.settings.maxRounds }));
  }
}

/** Moves the first queued match whose players are all free onto each free court. */
function fillCourts(s: SessionState) {
  if (s.status !== 'live') return;
  for (let c = 1; c <= s.settings.courts; c++) {
    if (s.matches.some((m) => m.court === c && ON_COURT.has(m.status))) continue;
    const busy = new Set(s.matches.filter((m) => ON_COURT.has(m.status)).flatMap((m) => [...m.a, ...m.b]));
    const next = s.matches.find(
      (m) =>
        m.status === 'queued' &&
        [...m.a, ...m.b].every((id) => !busy.has(id) && s.players.find((p) => p.id === id)?.status === 'active'),
    );
    if (!next) continue;
    next.status = 'live';
    next.court = c;
  }
}

function autoPairs(s: SessionState) {
  const ids = activePlayers(s).map((p) => p.id);
  s.pairs = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    s.pairs.push({ id: `pr${s.nextPairNo++}`, players: [ids[i]!, ids[i + 1]!], active: true });
  }
}

/** Fixed pairs: a leaver's partner pairs up with the next player who has no pair. */
function repair(s: SessionState) {
  for (const pair of s.pairs) {
    if (!pair.active) continue;
    if (pair.players.some((id) => s.players.find((p) => p.id === id)?.status !== 'active')) pair.active = false;
  }
  const paired = new Set(s.pairs.filter((p) => p.active).flatMap((p) => p.players));
  const loose = activePlayers(s).filter((p) => !paired.has(p.id)).map((p) => p.id);
  for (let i = 0; i + 1 < loose.length; i += 2) {
    s.pairs.push({ id: `pr${s.nextPairNo++}`, players: [loose[i]!, loose[i + 1]!], active: true });
  }
}

function settleLive(s: SessionState, playerId: string, choice: LiveChoice) {
  const m = s.matches.find((x) => ON_COURT.has(x.status) && [...x.a, ...x.b].includes(playerId));
  if (!m) return;
  const [ga, gb] = m.score.games;
  if (choice === 'skip' || (choice === 'keep' && ga === gb)) {
    m.status = 'skipped';
    return;
  }
  if (choice === 'keep') {
    m.status = 'done';
    m.result = { gamesA: ga, gamesB: gb, winner: ga > gb ? 0 : 1, reason: 'kept' };
    return;
  }
  const leaverTeam: Team = m.a.includes(playerId) ? 0 : 1;
  const winner: Team = leaverTeam === 0 ? 1 : 0;
  const to = s.settings.rules.gamesTo;
  const games: [number, number] = [ga, gb];
  games[winner] = Math.max(to, games[winner]);
  games[leaverTeam] = Math.min(games[leaverTeam], games[winner] - 1);
  m.status = 'done';
  m.result = { gamesA: games[0], gamesB: games[1], winner, reason: 'awarded' };
}

function leave(s: SessionState, playerId: string, choice: LiveChoice) {
  const p = player(s, playerId);
  if (p.status !== 'active') fail('not_active');
  settleLive(s, playerId, choice);
  p.status = 'left';
  if (s.settings.partnerMode === 'fixed' && s.settings.format === 'doubles') repair(s);
  regenerate(s);
}

export function applyEvent(s: SessionState, ev: SessionEvent): void {
  // A rebind may follow the close: guests can claim a closed session's results for 7 days.
  if (s.status === 'closed' && ev.type !== 'rebind') fail('closed');
  if (s.status === 'empty' && ev.type !== 'create') fail('no_session');
  const draft = s.status === 'draft';
  const live = s.status === 'live';

  switch (ev.type) {
    case 'create': {
      if (s.status !== 'empty') fail('exists');
      const { settings, hostPlayer, slug } = ev.payload;
      s.settings = settings;
      s.slug = slug;
      s.status = 'draft';
      s.createdAt = ev.at;
      s.players.push({ id: hostPlayer.id, name: hostPlayer.name, status: 'active', via: 'host', deviceId: ev.actor });
      s.hostPlayerId = hostPlayer.id;
      if (ev.actor) s.hostDevices.push(ev.actor);
      break;
    }
    case 'host_device':
      if (!s.hostDevices.includes(ev.payload.deviceId)) s.hostDevices.push(ev.payload.deviceId);
      break;
    case 'update_settings':
      if (!draft) fail('not_draft');
      s.settings = ev.payload.settings;
      break;
    case 'add_player': {
      if (!draft) fail('not_draft');
      if (s.players.some((p) => p.id === ev.payload.id)) fail('duplicate');
      s.players.push({ id: ev.payload.id, name: ev.payload.name, status: 'active', via: ev.payload.via, deviceId: null });
      break;
    }
    case 'remove_player': {
      if (!draft) fail('not_draft');
      const p = player(s, ev.payload.id);
      p.status = 'removed';
      s.pairs = [];
      break;
    }
    case 'claim': {
      const p = player(s, ev.payload.playerId);
      if (p.deviceId && p.deviceId !== ev.payload.deviceId) fail('claimed');
      if (s.players.some((x) => x.deviceId === ev.payload.deviceId && x.id !== p.id && x.status !== 'removed')) fail('device_has_player');
      p.deviceId = ev.payload.deviceId;
      break;
    }
    case 'reset_claim': {
      const p = player(s, ev.payload.playerId);
      if (p.deviceId) s.cohostDevices = s.cohostDevices.filter((d) => d !== p.deviceId);
      p.deviceId = null;
      break;
    }
    case 'join_request': {
      if (s.players.some((p) => p.id === ev.payload.id)) fail('duplicate');
      s.players.push({ id: ev.payload.id, name: ev.payload.name, status: 'pending', via: 'link', deviceId: null });
      break;
    }
    case 'approve_join': {
      const p = player(s, ev.payload.id);
      if (p.status !== 'pending') fail('not_pending');
      p.status = 'active';
      if (live) {
        if (s.settings.partnerMode === 'fixed' && s.settings.format === 'doubles') repair(s);
        regenerate(s);
      }
      break;
    }
    case 'decline_join': {
      const p = player(s, ev.payload.id);
      if (p.status !== 'pending') fail('not_pending');
      p.status = 'declined';
      break;
    }
    case 'set_pairs': {
      if (!draft) fail('not_draft');
      const ids = new Set(activePlayers(s).map((p) => p.id));
      const seen = new Set<string>();
      for (const pair of ev.payload.pairs) {
        for (const id of pair) {
          if (!ids.has(id) || seen.has(id)) fail('bad_pairs');
          seen.add(id);
        }
      }
      s.pairs = ev.payload.pairs.map((pr) => ({ id: `pr${s.nextPairNo++}`, players: [pr[0], pr[1]], active: true }));
      break;
    }
    case 'start': {
      if (!draft) fail('not_draft');
      const problem = startProblem(s);
      if (problem) fail(problem);
      if (s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed') {
        const paired = new Set(s.pairs.flatMap((p) => p.players));
        const allPaired = activePlayers(s).every((p) => paired.has(p.id)) && s.pairs.every((pr) => pr.players.every((id) => player(s, id).status === 'active'));
        if (!allPaired) autoPairs(s);
      }
      s.status = 'live';
      const units = scheduleUnits(s);
      s.targetRounds = s.settings.maxRounds ?? (isRotating(s.settings) ? defaultRounds(s.settings, units.length) : null);
      addMatches(s, buildSchedule({ settings: s.settings, units, startRound: 1, targetRounds: s.targetRounds }));
      break;
    }
    case 'add_late': {
      if (!live) fail('not_live');
      if (s.players.some((p) => p.id === ev.payload.id)) fail('duplicate');
      s.players.push({ id: ev.payload.id, name: ev.payload.name, status: 'active', via: 'late', deviceId: null });
      if (s.settings.partnerMode === 'fixed' && s.settings.format === 'doubles') repair(s);
      regenerate(s);
      break;
    }
    case 'mark_left':
      if (!live) fail('not_live');
      leave(s, ev.payload.playerId, ev.payload.live);
      break;
    case 'step_off': {
      if (!live) fail('not_live');
      const hostId = s.hostPlayerId ?? fail('host_not_playing');
      leave(s, hostId, ev.payload.live);
      if (s.settings.scorerMode === 'host') s.settings = { ...s.settings, scorerMode: 'players' };
      s.openHost = true;
      s.notices.push({ kind: 'host_stepped_off', name: player(s, hostId).name, seq: ev.seq });
      break;
    }
    case 'skip_match': {
      const m = match(s, ev.payload.matchId);
      if (!['queued', 'live', 'pending'].includes(m.status)) fail('not_skippable');
      m.status = 'skipped';
      break;
    }
    case 'unskip_match': {
      // Undo of a skip: the match goes back to the front of the queue.
      const m = match(s, ev.payload.matchId);
      if (m.status !== 'skipped' || !live) fail('not_skipped');
      if ([...m.a, ...m.b].some((id) => s.players.find((p) => p.id === id)?.status !== 'active')) fail('player_left');
      m.status = 'queued';
      m.court = null;
      s.matches = [m, ...s.matches.filter((x) => x !== m)];
      break;
    }
    case 'postpone_match': {
      // Play it later: back to the end of the queue, keeping any points already played.
      const m = match(s, ev.payload.matchId);
      if (!live || (m.status !== 'queued' && m.status !== 'live')) fail('not_postponable');
      m.status = 'queued';
      m.court = null;
      s.matches = [...s.matches.filter((x) => x !== m), m];
      break;
    }
    case 'rebind': {
      const { playerId, from, to } = ev.payload;
      const p = player(s, playerId);
      if (p.deviceId !== from) fail('not_bound');
      if (s.players.some((x) => x.deviceId === to && x.id !== playerId && x.status !== 'removed' && x.status !== 'declined')) fail('device_has_player');
      p.deviceId = to;
      const swap = (list: string[]) => [...new Set(list.map((d) => (d === from ? to : d)))];
      s.hostDevices = swap(s.hostDevices);
      s.cohostDevices = swap(s.cohostDevices);
      break;
    }
    case 'point':
    case 'undo': {
      const m = match(s, ev.payload.matchId);
      if (!ON_COURT.has(m.status)) fail('not_on_court');
      if (ev.type === 'point') {
        if (m.status === 'pending') fail('match_point_pending');
        m.inputs.push({ type: 'point', team: ev.payload.team });
      } else if (m.entered) {
        // Undo on a typed-in result takes the result back and returns to live scoring.
        m.entered = null;
      } else {
        if (!m.inputs.some((i) => i.type === 'point')) fail('nothing_to_undo');
        m.inputs.push({ type: 'undo' });
      }
      rescore(s, m);
      break;
    }
    case 'set_server': {
      const m = match(s, ev.payload.matchId);
      if (!ON_COURT.has(m.status)) fail('not_on_court');
      if (![...m.a, ...m.b].includes(ev.payload.playerId)) fail('not_in_match');
      m.serve = setServer(m.serve, ev.payload.playerId, serveSlot(m.score), m.a, m.b);
      break;
    }
    case 'confirm': {
      const m = match(s, ev.payload.matchId);
      const r = pendingResult(m);
      if (m.status !== 'pending' || !r) fail('not_pending');
      m.status = 'done';
      m.result = { ...r!, reason: m.entered ? 'entered' : 'played' };
      break;
    }
    case 'record_result': {
      const m = match(s, ev.payload.matchId);
      const { gamesA, gamesB } = ev.payload;
      if (!ON_COURT.has(m.status)) fail('not_on_court');
      if (!validGames(gamesA) || !validGames(gamesB) || gamesA === gamesB) fail('bad_score');
      if (isHostRole(roleOf(s, ev.actor))) {
        // Hosts are trusted: the result counts straight away.
        m.status = 'done';
        m.entered = null;
        m.result = { gamesA, gamesB, winner: gamesA > gamesB ? 0 : 1, reason: 'entered' };
      } else {
        m.entered = { gamesA, gamesB };
        m.status = 'pending';
      }
      break;
    }
    case 'edit_result': {
      const m = match(s, ev.payload.matchId);
      const { gamesA, gamesB } = ev.payload;
      if (m.status !== 'done') fail('not_done');
      if (gamesA === gamesB || gamesA < 0 || gamesB < 0) fail('bad_score');
      m.result = { gamesA, gamesB, winner: gamesA > gamesB ? 0 : 1, reason: 'edited' };
      s.edits.push({ matchId: m.id, seq: ev.seq, actor: ev.actor });
      break;
    }
    case 'hand_scoring': {
      if (s.settings.scorerMode === 'players') fail('already_players');
      s.settings = { ...s.settings, scorerMode: 'players' };
      const host = s.players.find((p) => p.id === s.hostPlayerId);
      s.notices.push({ kind: 'scoring_handed', name: host?.name ?? s.settings.hostName, seq: ev.seq });
      break;
    }
    case 'promote': {
      const p = player(s, ev.payload.playerId);
      if (!p.deviceId) fail('not_claimed');
      if (!s.cohostDevices.includes(p.deviceId)) s.cohostDevices.push(p.deviceId);
      break;
    }
    case 'close':
      if (s.status !== 'live' && s.status !== 'draft') fail('not_open');
      s.status = 'closed';
      s.closedBy = ev.payload.by;
      // Anything not confirmed by now does not count.
      for (const m of s.matches) if (m.status === 'queued' || m.status === 'live' || m.status === 'pending') m.status = 'skipped';
      break;
  }
  fillCourts(s);
}

const validGames = (n: number) => Number.isInteger(n) && n >= 0 && n <= 20;

/** The result waiting for confirmation: a typed-in score, or the live score after the winning point. */
export function pendingResult(m: MatchState): { gamesA: number; gamesB: number; winner: Team } | null {
  if (m.entered) return { ...m.entered, winner: m.entered.gamesA > m.entered.gamesB ? 0 : 1 };
  if (m.score.winner === null) return null;
  return { gamesA: m.score.games[0], gamesB: m.score.games[1], winner: m.score.winner };
}

export function reduceSession(events: SessionEvent[]): SessionState {
  const s = emptySession();
  for (const ev of events) {
    // Every rule check in applyEvent runs before it changes anything, so an ignored
    // event leaves the state as it was.
    try {
      applyEvent(s, ev);
    } catch (e) {
      if (!(e instanceof Ignore)) throw e;
      s.ignored.push({ seq: ev.seq, type: ev.type, reason: e.message });
    }
    s.lastSeq = Math.max(s.lastSeq, ev.seq);
    s.lastAt = ev.at;
  }
  return s;
}

// Selectors

export type Role = 'host' | 'co_host' | 'player' | 'spectator';

export function roleOf(s: SessionState, deviceId: string | null): Role {
  if (!deviceId) return 'spectator';
  if (s.hostDevices.includes(deviceId)) return 'host';
  if (s.cohostDevices.includes(deviceId)) return 'co_host';
  const p = s.players.find((x) => x.deviceId === deviceId && x.status !== 'removed' && x.status !== 'declined');
  if (!p) return 'spectator';
  // After the host steps off, every approved player runs the session; join requests still wait.
  if (s.openHost && (p.status === 'active' || p.status === 'left')) return 'co_host';
  return 'player';
}

/** A match can wait for later when it has not finished and another match can go first. */
export function canPostpone(s: SessionState, m: MatchState): boolean {
  if (s.status !== 'live' || (m.status !== 'queued' && m.status !== 'live')) return false;
  return s.matches.some((x) => x !== m && x.status === 'queued');
}

/** Skipped matches that can go back in the queue (everyone in them is still here). */
export function skippedMatches(s: SessionState): { match: MatchState; canReturn: boolean }[] {
  return s.matches
    .filter((m) => m.status === 'skipped')
    .map((m) => ({ match: m, canReturn: s.status === 'live' && [...m.a, ...m.b].every((id) => s.players.find((p) => p.id === id)?.status === 'active') }));
}

export const isHostRole = (r: Role) => r === 'host' || r === 'co_host';

export function myPlayer(s: SessionState, deviceId: string | null): PlayerState | null {
  if (!deviceId) return null;
  return s.players.find((p) => p.deviceId === deviceId && p.status !== 'removed' && p.status !== 'declined') ?? null;
}

export function nameOf(s: SessionState, playerId: string): string {
  return s.players.find((p) => p.id === playerId)?.name ?? '?';
}

export function sideName(s: SessionState, ids: string[]): string {
  return ids.map((id) => nameOf(s, id)).join(' & ');
}

export function unitName(s: SessionState, unit: string): string {
  const pair = s.pairs.find((p) => p.id === unit);
  if (pair) return sideName(s, pair.players);
  return sideName(s, unit.split('+'));
}

/** Why Start is blocked, or null when the session can start. */
export function startProblem(s: SessionState): string | null {
  const n = activePlayers(s).length;
  if (s.settings.format === 'singles') return n < 2 ? 'need_2' : null;
  if (n < 4) return 'need_4';
  if (s.settings.partnerMode === 'fixed' && n % 2 === 1) return 'odd_fixed';
  return null;
}

/** Matches the current roster would produce, for the review estimate. */
export function previewMatchCount(s: SessionState): number {
  const fake: SessionState = JSON.parse(JSON.stringify(s));
  if (fake.settings.format === 'doubles' && fake.settings.partnerMode === 'fixed' && fake.pairs.length === 0) autoPairs(fake);
  const units = scheduleUnits(fake);
  return buildSchedule({ settings: fake.settings, units, startRound: 1 }).length;
}

export function liveMatchOnCourt(s: SessionState, court: number): MatchState | null {
  return s.matches.find((m) => m.court === court && ON_COURT.has(m.status)) ?? null;
}

export function queue(s: SessionState): MatchState[] {
  return s.matches.filter((m) => m.status === 'queued');
}

/** Names of players a free court is waiting for, so the board can explain an empty court. */
export function waitingFor(s: SessionState): string[] {
  const next = queue(s)[0];
  if (!next) return [];
  const busy = new Set(s.matches.filter((m) => ON_COURT.has(m.status)).flatMap((m) => [...m.a, ...m.b]));
  return [...next.a, ...next.b].filter((id) => busy.has(id)).map((id) => nameOf(s, id));
}

export type PlayerStatus =
  | { kind: 'playing'; match: MatchState }
  | { kind: 'next'; match: MatchState }
  | { kind: 'resting'; wait: number }
  | { kind: 'done' }
  | { kind: 'left' }
  | { kind: 'pending' }
  | { kind: 'waiting_start' };

export function playerStatus(s: SessionState, playerId: string): PlayerStatus {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return { kind: 'done' };
  if (p.status === 'pending') return { kind: 'pending' };
  if (p.status === 'left') return { kind: 'left' };
  if (s.status === 'draft') return { kind: 'waiting_start' };
  const on = s.matches.find((m) => ON_COURT.has(m.status) && [...m.a, ...m.b].includes(playerId));
  if (on) return { kind: 'playing', match: on };
  const q = queue(s);
  const idx = q.findIndex((m) => [...m.a, ...m.b].includes(playerId));
  if (idx === -1) return { kind: 'done' };
  if (idx < s.settings.courts) return { kind: 'next', match: q[idx]! };
  return { kind: 'resting', wait: idx };
}

export function standings(s: SessionState): Standing[] {
  const fixed = s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed';
  const entries: Entry[] = [];
  for (const m of s.matches) {
    if (m.status !== 'done' || !m.result) continue;
    const { gamesA, gamesB, winner } = m.result;
    const unitsA = fixed || s.settings.format === 'singles' ? [m.unitA] : m.a;
    const unitsB = fixed || s.settings.format === 'singles' ? [m.unitB] : m.b;
    for (const u of unitsA) entries.push({ unit: u, win: winner === 0, gamesFor: gamesA, gamesAgainst: gamesB });
    for (const u of unitsB) entries.push({ unit: u, win: winner === 1, gamesFor: gamesB, gamesAgainst: gamesA });
  }
  const units = fixed
    ? s.pairs.filter((p) => p.active).map((p) => p.id)
    : s.players.filter((p) => p.status === 'active' || p.status === 'left').map((p) => p.id);
  return rank(units, entries);
}

/** The standing row a player belongs to (their pair, for fixed doubles). */
export function unitForPlayer(s: SessionState, playerId: string): string {
  if (s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed') {
    const pair = [...s.pairs].reverse().find((p) => p.players.includes(playerId));
    if (pair) return pair.id;
  }
  return playerId;
}

export function partnerOf(s: SessionState, playerId: string): string | null {
  if (s.settings.format !== 'doubles' || s.settings.partnerMode !== 'fixed') return null;
  const pair = s.pairs.find((p) => p.active && p.players.includes(playerId));
  return pair ? pair.players.find((id) => id !== playerId) ?? null : null;
}

export function biggestWin(s: SessionState): MatchState | null {
  let best: MatchState | null = null;
  for (const m of s.matches) {
    if (m.status !== 'done' || !m.result) continue;
    const diff = Math.abs(m.result.gamesA - m.result.gamesB);
    if (!best || diff > Math.abs(best.result!.gamesA - best.result!.gamesB)) best = m;
  }
  return best;
}

export function progress(s: SessionState): { done: number; total: number; skipped: number } {
  const done = s.matches.filter((m) => m.status === 'done').length;
  const skipped = s.matches.filter((m) => m.status === 'skipped').length;
  return { done, total: s.matches.length - skipped, skipped };
}

export function allMatchesFinished(s: SessionState): boolean {
  return s.status === 'live' && s.matches.length > 0 && s.matches.every((m) => m.status === 'done' || m.status === 'skipped');
}

// Permissions (mirrored in supabase/migrations)

export interface CourtLock {
  court: number;
  matchId: string;
  deviceId: string;
  heartbeatAt: number;
}

export function canAppend(
  s: SessionState,
  deviceId: string,
  type: EventType,
  payload: Record<string, unknown>,
  locks: CourtLock[],
): string | null {
  if (s.status === 'closed') return 'session_closed';
  const role = roleOf(s, deviceId);
  if (HOST_EVENTS.includes(type)) {
    if (!isHostRole(role)) return 'host_only';
    if (type === 'promote' && role !== 'host') return 'host_only';
    return null;
  }
  const court = Number(payload.court);
  const lock = locks.find((l) => l.court === court);
  if (SCORING_EVENTS.includes(type)) {
    if (!lock || lock.deviceId !== deviceId || lock.matchId !== payload.matchId) return 'no_lock';
    return null;
  }
  if (type === 'record_result') {
    if (isHostRole(role)) return null;
    if (!lock || lock.deviceId !== deviceId || lock.matchId !== payload.matchId) return 'no_lock';
    return null;
  }
  if (type === 'confirm') {
    if (isHostRole(role)) return null;
    if (s.settings.scorerMode === 'players' && role === 'player' && lock?.deviceId !== deviceId) return null;
    return 'cannot_confirm';
  }
  return 'unknown_event';
}

export function canScore(s: SessionState, deviceId: string | null, m: MatchState | null): boolean {
  if (!deviceId || !m || s.status !== 'live') return false;
  const role = roleOf(s, deviceId);
  if (isHostRole(role)) return true;
  if (s.settings.scorerMode !== 'players' || role !== 'player') return false;
  const me = myPlayer(s, deviceId);
  return !!me && [...m.a, ...m.b].includes(me.id);
}

/** Players mode: the confirm comes from the team that did not score. */
export function canConfirm(s: SessionState, deviceId: string | null, m: MatchState, lockHolder: string | null): boolean {
  if (!deviceId || m.status !== 'pending') return false;
  const role = roleOf(s, deviceId);
  if (isHostRole(role)) return true;
  if (s.settings.scorerMode !== 'players' || role !== 'player') return false;
  const me = myPlayer(s, deviceId);
  if (!me || lockHolder === deviceId) return false;
  const holder = s.players.find((p) => p.deviceId === lockHolder);
  const mySide = m.a.includes(me.id) ? 'a' : m.b.includes(me.id) ? 'b' : null;
  if (!mySide) return false;
  const holderSide = holder ? (m.a.includes(holder.id) ? 'a' : m.b.includes(holder.id) ? 'b' : null) : null;
  return holderSide !== mySide;
}
