import type { LevelChange } from './backend';

/** Level changes in rating order → one line per player: where they started and where they ended. */
export function summarizeChanges(changes: { user: string; before: number; after: number }[], playerOf: Map<string, string>): LevelChange[] {
  const out = new Map<string, LevelChange>();
  for (const c of changes) {
    const cur = out.get(c.user);
    if (cur) cur.after = c.after;
    else out.set(c.user, { userId: c.user, playerId: playerOf.get(c.user) ?? '', before: c.before, after: c.after });
  }
  return [...out.values()];
}
