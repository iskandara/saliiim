# Saliiim

Saliiim runs casual tennis sessions from one phone. A host sets up courts and rules, shares one
link in WhatsApp, and everyone sees courts, scores and standings live. Players join without an
account; signing in adds a profile, stats and a playing level. Built for casual groups in Indonesia.

- Live app: https://saliiim.iskandara.workers.dev
- Languages: English and Jaksel (Jakarta Indonesian-English slang). Light and dark themes.
- Everything is free; nothing is paid yet.

**Keep this file current.** Whenever a feature ships, changes or is removed, update "What's live"
and "Coming next" in the same commit. Other people's Claude sessions read this file to understand
the product (including for marketing), so a stale line here becomes a wrong claim in a post.

## What's live (as of 23 Nov 2026)

**Running a session (M1)**
- Setup: singles or doubles; rotating partners or fixed pairs; 1 to 4 courts, up to 16 players;
  games to 4 or 6; one deuce, advantage or no-ad; first to N or win by 2; optional tiebreak to 7 or 10.
- Players join by link (name only) or the host types names. Spare courts play singles.
- Live scoring: the host scores, or players score their own court. Serve order, undo, deuce and
  tiebreak banners. Every result is confirmed by the other side or the host.
- A final score can be typed in instead, checked against the match rules.
- Courts board: numbered Next up, skip with undo, "play it later", skipped list, mark someone left,
  add late arrivals. If the host steps off, every player becomes a co-host.
- Standings by win rate then game difference. Live view for spectators, and TV mode.
- Works offline: points queue on the phone and sync when the signal returns.
- End of session: summary, a shareable sticker (wide, six colours, two of them see-through),
  feedback form. Sessions close on their own after 3 idle hours.

**Accounts and profiles (M2, steps 1 and 2)**
- Sign in with Google or an email code. Hosts must sign in; players and spectators never have to.
- A guest can save a session's results to a new account during the session or within 7 days after.
- Level from 1.0 to 7.0 (Elo-style), updated after each session closes; changes show on the summary.
- Profile: level, career stats, head-to-head and partners, match history. Public by default; can be
  made private, or sections hidden.

## Coming next (no dates)

- Groups (rest of M2): a page per regular crew with invite link, members, sessions and a leaderboard.
- Tap any player's name to open their profile; upload your own profile photo.
- Later: own domain, WhatsApp sign-in, fairer partner rotation, finding a match near your level,
  regional ranking, deeper stats, courts directory. Not promised until listed under "What's live".

## Where things are

| Path | What |
| --- | --- |
| `src/core/` | Pure logic: scoring rules, scheduler, session engine (event log), rating, stats |
| `src/screens/`, `src/ui/` | React screens and shared components |
| `src/state/` | Backends: Supabase (live) and a demo backend that runs in the browser |
| `src/i18n/strings.ts` | Every piece of UI copy, English and Jaksel |
| `worker/index.ts` | Cloudflare Worker: serves the app; rates closed sessions; profile API |
| `supabase/migrations/` | Database, run in order in the Supabase SQL Editor |
| `scripts/capture/` | Marketing capture kit: screenshots and tutorial videos from demo mode |
| `DESIGN.md` | Visual direction: court-blue moments, green frame, lime accent, italic type |
| `docs/ARCHITECTURE.md` | How sessions sync and who may do what |

## Commands

```bash
npm install
npm run dev        # demo mode in the browser (no Supabase needed); sign-in code is 123456
npm test           # engine, rating and database tests
npm run build      # typecheck and build
npm run capture    # marketing screenshots and videos, see .claude/skills/marketing-content
```

## Rules

- Copy lives in `src/i18n/strings.ts`, both languages together. No em dashes. Tennis terms stay English.
- Never commit secrets. The Supabase publishable key in `.env.production` is public by design; the
  secret key lives only in Cloudflare.
- Database changes go in a new numbered migration; the owner runs it in Supabase.
- Marketing material uses demo data only (the capture kit does this): never real players' names.
