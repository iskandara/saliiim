# Saliiim!

Run a casual tennis session from one phone. The host sets up courts and rules, shares one link in WhatsApp, and scores live. Players join without an account, see their status and the standings, and get a shareable sticker at the end.

> "You tap the points. We do the rest."

## What M1 does

- **Setup:** singles or doubles, rotating or fixed partners, 1–4 courts, first to 4 or 6 games, one deuce / advantage / no-ad, optional tiebreak, round cap, and who scores.
- **One public link:** players choose *Join to play* or *Just watching*. A claimed name is locked to that phone.
- **Courts board:** the queue fills free courts automatically. Hosts can skip (with undo), mark players as left, add late arrivals, approve join requests, hand scoring to players and promote a co-host.
- **Live scoring:** one tap per point, unlimited undo, serve rotation, deuce and tiebreak banners. **One phone scores each court at a time** (court lock); others can take over after confirming.
- **Confirmation:** in *Players on court* mode, the other team confirms the result.
- **Standings:** win rate, then game difference per match, then games won.
- **Close:** prompted when all matches are done; sessions auto-close after 3 hours without activity. Summary, results, and a personal 1000×880 transparent PNG sticker.
- **English and Jaksel copy**, light and dark themes, keyboard scoring on laptops (arrow keys, Z to undo).

## Stack (all on free tiers)

| Part | Choice | Why |
|---|---|---|
| Web app | React + TypeScript + Vite | Static site, fast on mid-range Android |
| Hosting | Cloudflare Pages | Free, unlimited bandwidth, Jakarta edge, commercial use allowed |
| Backend | Supabase (Postgres, Realtime, anonymous auth, pg_cron) | Free tier covers M1; server-side checks without paid functions |
| CI | GitHub Actions | Typecheck, tests, build on every push |

How it fits together: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it locally

```bash
npm install
npm run dev
```

With no Supabase keys, the app runs in **demo mode**: sessions live in this browser, and each tab acts as a separate phone. Open the host view in one tab and the public link in another to try the player side.

```bash
npm test          # rules, session engine, and the SQL migration on an in-memory Postgres
npm run typecheck
npm run build
```

## Deploy (free)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (region: Singapore is closest to Indonesia).
2. **Authentication → Sign In / Providers:** turn on **Anonymous sign-ins**.
3. **Database → Extensions:** enable **pg_cron** (used for auto-close).
4. **SQL Editor:** paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
5. **Project Settings → API Keys:** copy the **Project URL** and the **Publishable key** (starts with `sb_publishable_`). Supabase is retiring the old `anon` key by the end of 2026.

Free-tier note: Supabase pauses free projects after a week with no activity. Open the dashboard to resume it.

### 2. Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, pick this repository.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from step 1.5.
4. Deploy. `public/_redirects` already sends every route to the app.

The publishable key is safe in the browser: all writes go through Postgres functions that check the caller's role, and row-level security limits reads to people who opened the session's link.

## Project layout

```
src/core/      Pure rules, no UI or network: scoring, serve rotation, scheduler, standings, session engine
src/state/     Backends (local demo + Supabase), offline queue, session hook
src/screens/   One file per screen
src/ui/        Shared components, styles helpers, sticker drawing
src/i18n/      English and Jaksel strings
supabase/      SQL migration: tables, row-level security, write functions, court locks, auto-close
tests/         Vitest unit tests and the database test (PGlite)
```
