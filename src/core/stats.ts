/**
 * Profile stats from counted results (M2 spec, "Profiles"): career numbers, head-to-head, partners
 * and match history. Pure: the results Worker and demo mode share it.
 */

/** One counted match as stored: players by session id, account ids where linked (null = guest). */
export interface ResultRow {
  sessionId: string;
  sessionName: string;
  playedAt: string;
  matchId: string;
  ord: number;
  format: 'singles' | 'doubles';
  aUsers: (string | null)[];
  bUsers: (string | null)[];
  aNames: string[];
  bNames: string[];
  gamesA: number;
  gamesB: number;
  winner: 0 | 1;
  /** This player's level change from the match, in rating points, when they had an account then. */
  delta?: number | null;
}

export interface Record2 {
  user: string;
  wins: number;
  losses: number;
}

export interface Career {
  sessions: number;
  matches: number;
  wins: number;
  losses: number;
  /** 0 to 100, rounded. */
  winPct: number;
  gamesWon: number;
  gamesLost: number;
  singles: { matches: number; wins: number };
  doubles: { matches: number; wins: number };
  /** Wins in a row up to the latest match. */
  streak: number;
}

export interface HistoryMatch {
  matchId: string;
  format: 'singles' | 'doubles';
  partners: string[];
  opponents: string[];
  myGames: number;
  theirGames: number;
  won: boolean;
  delta: number | null;
}

export interface HistorySession {
  sessionId: string;
  sessionName: string;
  playedAt: string;
  matches: HistoryMatch[];
}

export interface ProfileStats {
  career: Career;
  opponents: Record2[];
  partners: Record2[];
  /** Highest win rate with a partner over at least 3 matches. */
  bestPartner: Record2 | null;
  /** Lowest win rate against an opponent over at least 2 matches. */
  toughestRival: Record2 | null;
  history: HistorySession[];
}

const rate = (r: Record2) => r.wins / Math.max(1, r.wins + r.losses);

function tally(map: Map<string, Record2>, user: string, won: boolean) {
  const r = map.get(user) ?? { user, wins: 0, losses: 0 };
  if (won) r.wins++;
  else r.losses++;
  map.set(user, r);
}

/** Newest first: by when the session was played, then the order inside it. */
const newestFirst = (x: ResultRow, y: ResultRow) => y.playedAt.localeCompare(x.playedAt) || y.ord - x.ord;

export function profileStats(rows: ResultRow[], me: string): ProfileStats {
  const mine = rows
    .map((r) => {
      const side = r.aUsers.includes(me) ? 0 : r.bUsers.includes(me) ? 1 : -1;
      return { r, side };
    })
    .filter((x) => x.side >= 0)
    .sort((x, y) => newestFirst(x.r, y.r));

  const career: Career = {
    sessions: new Set(mine.map((x) => x.r.sessionId)).size,
    matches: mine.length,
    wins: 0,
    losses: 0,
    winPct: 0,
    gamesWon: 0,
    gamesLost: 0,
    singles: { matches: 0, wins: 0 },
    doubles: { matches: 0, wins: 0 },
    streak: 0,
  };
  const opp = new Map<string, Record2>();
  const par = new Map<string, Record2>();
  const history: HistorySession[] = [];
  let streakOpen = true;

  for (const { r, side } of mine) {
    const won = r.winner === side;
    const [myUsers, theirUsers] = side === 0 ? [r.aUsers, r.bUsers] : [r.bUsers, r.aUsers];
    const [myNames, theirNames] = side === 0 ? [r.aNames, r.bNames] : [r.bNames, r.aNames];
    const [myGames, theirGames] = side === 0 ? [r.gamesA, r.gamesB] : [r.gamesB, r.gamesA];
    if (won) career.wins++;
    else career.losses++;
    career.gamesWon += myGames;
    career.gamesLost += theirGames;
    const fmt = career[r.format];
    fmt.matches++;
    if (won) fmt.wins++;
    if (streakOpen) {
      if (won) career.streak++;
      else streakOpen = false;
    }
    // Head-to-head and partners only with people who have accounts: a guest name is not one person.
    for (const u of theirUsers) if (u) tally(opp, u, won);
    for (const u of myUsers) if (u && u !== me) tally(par, u, won);

    const myIndex = myUsers.indexOf(me);
    let session = history.at(-1);
    if (!session || session.sessionId !== r.sessionId) {
      session = { sessionId: r.sessionId, sessionName: r.sessionName, playedAt: r.playedAt, matches: [] };
      history.push(session);
    }
    session.matches.push({
      matchId: r.matchId,
      format: r.format,
      partners: myNames.filter((_, i) => i !== myIndex),
      opponents: theirNames,
      myGames,
      theirGames,
      won,
      delta: r.delta ?? null,
    });
  }
  career.winPct = career.matches ? Math.round((career.wins / career.matches) * 100) : 0;

  const byMatches = (x: Record2, y: Record2) => y.wins + y.losses - (x.wins + x.losses) || rate(y) - rate(x);
  const opponents = [...opp.values()].sort(byMatches);
  const partners = [...par.values()].sort(byMatches);
  const bestPartner = partners.filter((p) => p.wins + p.losses >= 3).sort((x, y) => rate(y) - rate(x) || byMatches(x, y))[0] ?? null;
  const toughestRival = opponents.filter((p) => p.wins + p.losses >= 2).sort((x, y) => rate(x) - rate(y) || byMatches(x, y))[0] ?? null;
  return { career, opponents, partners, bestPartner, toughestRival, history };
}
