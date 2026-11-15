# Architecture

## The core idea: one event log per session

Every change to a session is an event: `create`, `add_player`, `start`, `point`, `undo`, `confirm`, `mark_left`, `close`, and so on. The server stores events in order. Every phone replays the same log through the same pure function (`reduceSession` in `src/core/session.ts`) and gets the same courts, queue, scores and standings.

This gives us:

- **Undo and edits for free:** undo is an event; the score is recomputed by replay.
- **Offline scoring:** events wait in a local queue and are sent in order on reconnect.
- **An audit trail:** every result edit, skip and role change is in the log with who did it.
- **Ready for M2:** match history, head-to-head and ratings can be computed from the same events.

## Layers

```
Screens (src/screens)        read state, send events
   │
App state (src/state)        useSession, backends, offline queue, court lock client
   │
Core rules (src/core)        scoring, serve rotation, scheduler, standings, session engine (pure, unit-tested)

Backend (supabase/)          Postgres tables + row-level security + write functions + pg_cron
```

Dependencies point down only. Core rules never import UI or network code. Screens never call the backend directly.

## Identity without accounts

Each phone signs in to Supabase **anonymously**. Its user id is the device id. Roles live in `session_roles`:

| Role | How a phone gets it |
|---|---|
| host | Created the session, or opened the private host link (`/h/:id#key`) |
| co_host | Promoted by the host (must have claimed a player) |
| player | Joined with a name or tapped "That's me" — the name is then locked to that phone |
| spectator | Opened the public link (`/p/:slug`) |

## Who can write what

All writes go through `security definer` functions in `supabase/migrations/0001_init.sql`. There are no insert/update policies on the tables.

| Function | Rule |
|---|---|
| `create_session` | Any signed-in phone; it becomes host |
| `open_public(slug)` | Registers the phone as spectator so it can read |
| `join_session` / `claim_player` | One player per phone, one phone per player |
| `append_event` host events | host or co_host (promote: host only) |
| `append_event` point / undo / set_server | Only the phone holding that court's lock for that match |
| `append_event` confirm | host/co_host, or (in players mode) a player who is **not** the lock holder |
| `acquire_lock` | host/co_host, or players when scoring is handed to players; taking a held lock needs `force` |
| `auto_close_sessions` | pg_cron every 10 minutes: closes live sessions idle for 3 hours |

The same rules are mirrored in TypeScript (`canAppend`) for the local demo backend and for hiding buttons.

**Known gap:** the database checks that only the lock holder scores, but it does not know the match line-ups (they are derived on the phones). The app only offers "Score my court" to players in that match, and a host can always skip or edit a result. Moving line-ups server-side is an M2 item.

## Court lock

One phone scores a court at a time. The scorer's phone holds a row in `court_locks` and sends a heartbeat every 15 seconds. Other phones see "Sari is scoring this court" and can take over after confirming; the old phone's queued points are then refused and it shows a notice. Confirming a match releases the lock.

## Standings

Win rate, then game difference per match, then games won. Win rate keeps it fair when people play different numbers of matches (byes, late arrivals, leavers). Fixed pairs are ranked as pairs; singles and rotating doubles per player.

## Data kept for M2

Nothing is deleted in M1. Players carry stable ids and their claiming device, so M2 accounts can claim past matches, and head-to-head and partner stats can be built from the event log.

## Changing the scheduler safely

The schedule is rebuilt on every phone from the event log, so a scheduler change must not alter sessions that already started. New behaviour goes behind a setting saved in the session's `create` event, with a missing value meaning the old behaviour. Example: `spareCourts` (singles on spare courts) is `'singles'` for new sessions and missing, so `'empty'`, for older ones.
