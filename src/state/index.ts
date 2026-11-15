import type { Backend } from './backend';
import { LocalBackend } from './localBackend';
import { SupabaseBackend } from './supabaseBackend';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Publishable key (sb_publishable_…). The legacy anon key still works as a fallback until Supabase retires it.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** Supabase when configured, otherwise the in-browser demo backend. */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new LocalBackend();

/** Sessions this phone created or joined, for the Home screen. Stored on the device only. */
export interface HistoryItem {
  id: string;
  slug: string;
  name: string;
  role: 'host' | 'player';
  hostKey?: string;
  at: string;
}

const HISTORY = 'saliiim:history';

export function readHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? '[]');
  } catch {
    return [];
  }
}

export function remember(item: HistoryItem) {
  const list = readHistory().filter((h) => h.id !== item.id);
  const prev = readHistory().find((h) => h.id === item.id);
  list.unshift({ ...prev, ...item, hostKey: item.hostKey ?? prev?.hostKey });
  try {
    localStorage.setItem(HISTORY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage full or blocked: history is a convenience only */
  }
}

export function hostKeyFor(sessionId: string): string | undefined {
  return readHistory().find((h) => h.id === sessionId)?.hostKey;
}

/** Roster from the most recent session this phone hosted, used by Repeat. */
const ROSTER = 'saliiim:last-roster';
export function saveRoster(names: string[]) {
  try {
    localStorage.setItem(ROSTER, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}
export function lastRoster(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ROSTER) ?? '[]');
  } catch {
    return [];
  }
}
