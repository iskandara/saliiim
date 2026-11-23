/**
 * What a profile page shows to a given viewer (M2 spec, "Profiles"): the owner sees everything;
 * others see a public profile minus any hidden sections, and nothing of a private one.
 */
import { levelOf } from './rating';
import { profileStats, type ProfileStats, type Record2, type ResultRow } from './stats';

export interface ProfileRecord {
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  hand: 'left' | 'right' | null;
  formatPref: 'singles' | 'doubles' | 'both' | null;
  rating: number;
  ratedMatches: number;
  isPublic: boolean;
  showBasics: boolean;
  showStats: boolean;
  showH2h: boolean;
  showHistory: boolean;
}

export interface PersonRef {
  name: string;
  photoUrl: string | null;
  /** Whether their own profile can be opened. */
  open: boolean;
}

export interface ProfileView {
  id: string;
  owner: boolean;
  private: boolean;
  name: string;
  photoUrl: string | null;
  city: string | null;
  hand: ProfileRecord['hand'];
  formatPref: ProfileRecord['formatPref'];
  /** Null when basics are hidden from this viewer. */
  level: number | null;
  ratedMatches: number;
  isPublic: boolean;
  show: { basics: boolean; stats: boolean; h2h: boolean; history: boolean };
  career: ProfileStats['career'] | null;
  opponents: Record2[] | null;
  partners: Record2[] | null;
  bestPartner: Record2 | null;
  toughestRival: Record2 | null;
  history: ProfileStats['history'] | null;
  people: Record<string, PersonRef>;
}

export function buildProfileView(
  p: ProfileRecord,
  rows: ResultRow[],
  viewer: string | null,
  people: Record<string, PersonRef>,
): ProfileView {
  const owner = viewer === p.id;
  const show = { basics: p.showBasics, stats: p.showStats, h2h: p.showH2h, history: p.showHistory };
  const base = {
    id: p.id, owner, isPublic: p.isPublic, show, people: {},
    career: null, opponents: null, partners: null, bestPartner: null, toughestRival: null, history: null,
  };
  if (!p.isPublic && !owner) {
    return { ...base, private: true, name: p.name, photoUrl: null, city: null, hand: null, formatPref: null, level: null, ratedMatches: 0 };
  }
  const see = (flag: boolean) => owner || flag;
  const st = profileStats(rows, p.id);
  const h2h = see(show.h2h);
  // Only the people named in what this viewer may see.
  const named = new Set<string>(h2h ? [...st.opponents, ...st.partners].map((r) => r.user) : []);
  return {
    ...base,
    private: false,
    name: p.name,
    photoUrl: see(show.basics) ? p.photoUrl : null,
    city: see(show.basics) ? p.city : null,
    hand: see(show.basics) ? p.hand : null,
    formatPref: see(show.basics) ? p.formatPref : null,
    level: see(show.basics) ? levelOf(p.rating) : null,
    ratedMatches: p.ratedMatches,
    career: see(show.stats) ? st.career : null,
    opponents: h2h ? st.opponents : null,
    partners: h2h ? st.partners : null,
    bestPartner: h2h ? st.bestPartner : null,
    toughestRival: h2h ? st.toughestRival : null,
    history: see(show.history) ? st.history : null,
    people: Object.fromEntries(Object.entries(people).filter(([id]) => named.has(id))),
  };
}
