import { describe, expect, it } from 'vitest';
import { applyPoint, finalScoreProblem, initialScore, maxGames, pointLabels, replayScore, scoreBanner, serveSlot, type ScoreInput, type ScoreState } from '../src/core/scoring';
import { DEFAULT_RULES, type Rules, type Team } from '../src/core/types';

const rules = (r: Partial<Rules> = {}): Rules => ({ ...DEFAULT_RULES, ...r });
const play = (seq: string, r: Rules, from: ScoreState = initialScore()) =>
  [...seq].reduce((s, c) => applyPoint(s, (c === 'a' ? 0 : 1) as Team, r), from);
const game = (team: 'a' | 'b') => team.repeat(4);

describe('points', () => {
  it('counts 0, 15, 30, 40', () => {
    const r = rules({ deuce: 'advantage' });
    expect(pointLabels(play('a', r))).toEqual(['15', '0']);
    expect(pointLabels(play('aab', r))).toEqual(['30', '15']);
    expect(pointLabels(play('aaab', r))).toEqual(['40', '15']);
  });

  it('advantage needs two clear points', () => {
    const r = rules({ deuce: 'advantage' });
    const deuce = play('aaabbb', r);
    expect(pointLabels(deuce)).toEqual(['40', '40']);
    expect(scoreBanner(deuce, r)).toBe('deuce');
    expect(pointLabels(play('a', r, deuce))).toEqual(['AD', '40']);
    expect(play('ab', r, deuce).games).toEqual([0, 0]);
    expect(play('abaa', r, deuce).games).toEqual([1, 0]);
  });

  it('no-ad: next point at deuce wins', () => {
    const r = rules({ deuce: 'no_ad' });
    const deuce = play('aaabbb', r);
    expect(scoreBanner(deuce, r)).toBe('deciding');
    expect(play('b', r, deuce).games).toEqual([0, 1]);
  });

  it('one deuce: one advantage, then a deciding point', () => {
    const r = rules({ deuce: 'one_deuce' });
    const deuce = play('aaabbb', r);
    expect(scoreBanner(deuce, r)).toBe('deuce_warning');
    expect(play('aa', r, deuce).games).toEqual([1, 0]);
    const second = play('ab', r, deuce);
    expect(second.games).toEqual([0, 0]);
    expect(scoreBanner(second, r)).toBe('deciding');
    expect(play('b', r, second).games).toEqual([0, 1]);
  });
});

describe('games and match end', () => {
  it('first to 4 ends at 4-3 without tiebreak', () => {
    const r = rules({ deuce: 'no_ad' });
    const s = play(game('a').repeat(3) + game('b').repeat(3) + game('a'), r);
    expect(s.games).toEqual([4, 3]);
    expect(s.winner).toBe(0);
  });

  it('first to 4 with tiebreak plays a tiebreak at 3-3 and records 4-3', () => {
    const r = rules({ deuce: 'no_ad', tiebreak: true, tiebreakTo: 7 });
    let s = play(game('a').repeat(3) + game('b').repeat(3), r);
    expect(s.tiebreak).toBe(true);
    expect(scoreBanner(s, r)).toBe('tiebreak');
    s = play('aaaaaabbbbbb', r, s);
    expect(pointLabels(s)).toEqual(['6', '6']);
    expect(s.winner).toBeNull();
    s = play('ab', r, s);
    expect(s.winner).toBeNull();
    s = play('bb', r, s);
    expect(s.winner).toBe(1);
    expect(s.games).toEqual([3, 4]);
  });

  it('win by 2 continues past 4-4 without tiebreak', () => {
    const r = rules({ deuce: 'no_ad', margin: 'win_by_2' });
    let s = play((game('a') + game('b')).repeat(4), r);
    expect(s.games).toEqual([4, 4]);
    s = play(game('a'), r, s);
    expect(s.winner).toBeNull();
    s = play(game('a'), r, s);
    expect(s.winner).toBe(0);
    expect(s.games).toEqual([6, 4]);
  });

  it('win by 2 with tiebreak at 4-4 records 5-4', () => {
    const r = rules({ deuce: 'no_ad', margin: 'win_by_2', tiebreak: true, tiebreakTo: 10 });
    let s = play((game('a') + game('b')).repeat(4), r);
    expect(s.tiebreak).toBe(true);
    s = play('a'.repeat(10), r, s);
    expect(s.winner).toBe(0);
    expect(s.games).toEqual([5, 4]);
  });

  it('first to 6 needs 6 games', () => {
    const r = rules({ gamesTo: 6, deuce: 'no_ad' });
    expect(play(game('a').repeat(5), r).winner).toBeNull();
    expect(play(game('a').repeat(6), r).winner).toBe(0);
  });

  it('ignores points after the winning point', () => {
    const r = rules({ deuce: 'no_ad' });
    const s = play(game('a').repeat(4), r);
    expect(applyPoint(s, 1, r)).toBe(s);
  });
});

describe('undo and replay', () => {
  it('undo removes the latest point, across games', () => {
    const r = rules({ deuce: 'no_ad' });
    const { score } = replayScore(
      [...[...'aaaa'].map((): ScoreInput => ({ type: 'point', team: 0 })), { type: 'undo' }],
      r,
    );
    expect(score.games).toEqual([0, 0]);
    expect(pointLabels(score)).toEqual(['40', '0']);
  });

  it('undo all the way back to 0-0', () => {
    const r = rules();
    const { score } = replayScore([{ type: 'point', team: 1 }, { type: 'undo' }, { type: 'undo' }], r);
    expect(score).toEqual(initialScore());
  });

  it('undo after the winning point reopens the match', () => {
    const r = rules({ deuce: 'no_ad' });
    const pts = [...game('a').repeat(4)].map(() => ({ type: 'point' as const, team: 0 as Team }));
    expect(replayScore(pts, r).score.winner).toBe(0);
    expect(replayScore([...pts, { type: 'undo' }], r).score.winner).toBeNull();
  });
});

describe('serve slot', () => {
  it('advances per game and in tiebreak after point 1, then every 2', () => {
    const r = rules({ deuce: 'no_ad', tiebreak: true });
    let s = play(game('a').repeat(3) + game('b').repeat(3), r);
    expect(serveSlot(s)).toBe(6);
    s = play('a', r, s);
    expect(serveSlot(s)).toBe(7);
    s = play('a', r, s);
    expect(serveSlot(s)).toBe(7);
    s = play('a', r, s);
    expect(serveSlot(s)).toBe(8);
  });
});

describe('typed-in final scores follow the rules', () => {
  const base = { gamesTo: 4 as const, deuce: 'no_ad' as const, tiebreakTo: 7 as const };
  it('race to 4: the winner has exactly 4', () => {
    const r = { ...base, margin: 'first_to' as const, tiebreak: false };
    expect(finalScoreProblem(4, 3, r)).toBeNull();
    expect(finalScoreProblem(0, 4, r)).toBeNull();
    expect(finalScoreProblem(5, 3, r)).toBe('over_first');
    expect(finalScoreProblem(3, 2, r)).toBe('short');
    expect(finalScoreProblem(2, 2, r)).toBe('tie');
    expect(maxGames(r)).toBe(4);
  });
  it('win by 2: ends the moment someone leads by 2 at 4 or more', () => {
    const r = { ...base, margin: 'win_by_2' as const, tiebreak: false };
    expect(finalScoreProblem(4, 2, r)).toBeNull();
    expect(finalScoreProblem(6, 4, r)).toBeNull();
    expect(finalScoreProblem(4, 3, r)).toBe('lead');
    expect(finalScoreProblem(6, 3, r)).toBe('over_lead');
  });
  it('win by 2 with a tiebreak at 4-4: tops out at 5', () => {
    const r = { ...base, margin: 'win_by_2' as const, tiebreak: true };
    expect(finalScoreProblem(5, 4, r)).toBeNull();
    expect(finalScoreProblem(5, 3, r)).toBeNull();
    expect(finalScoreProblem(5, 2, r)).toBe('over_tb');
    expect(finalScoreProblem(6, 4, r)).toBe('over_tb');
    expect(maxGames(r)).toBe(5);
  });
});
