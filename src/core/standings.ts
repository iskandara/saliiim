/** One ranked unit's outcome in one match. */
export interface Entry {
  unit: string;
  win: boolean;
  gamesFor: number;
  gamesAgainst: number;
}

export interface Standing {
  unit: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  winRate: number;
}

/**
 * Ranking: win rate, then game difference per match, then games won.
 * Win rate (not total wins) keeps it fair when match counts differ.
 */
export function rank(units: string[], entries: Entry[]): Standing[] {
  const table = new Map<string, Standing>();
  const row = (unit: string) => {
    let s = table.get(unit);
    if (!s) {
      s = { unit, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, gameDiff: 0, winRate: 0 };
      table.set(unit, s);
    }
    return s;
  };
  units.forEach(row);
  for (const e of entries) {
    const s = row(e.unit);
    s.played++;
    if (e.win) s.wins++;
    else s.losses++;
    s.gamesWon += e.gamesFor;
    s.gamesLost += e.gamesAgainst;
  }
  const list = [...table.values()];
  for (const s of list) {
    s.gameDiff = s.gamesWon - s.gamesLost;
    s.winRate = s.played ? s.wins / s.played : 0;
  }
  const perMatch = (s: Standing) => (s.played ? s.gameDiff / s.played : 0);
  return list.sort(
    (x, y) =>
      y.winRate - x.winRate ||
      perMatch(y) - perMatch(x) ||
      y.gamesWon - x.gamesWon ||
      y.played - x.played ||
      x.unit.localeCompare(y.unit),
  );
}
