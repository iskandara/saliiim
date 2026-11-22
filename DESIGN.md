# Saliiim design direction

Sources: the M1 mockup and PRD by the Saliiim team, and two reference images the owner supplied on 2026-11-15 (a framed blue hard court on clay, lime pill buttons, italic uppercase headlines, rows of tennis balls). This file records that direction so later changes keep to it.

Design Read: courtside session tool for casual tennis groups in Indonesia, used one-handed on mid-range Android phones in bright sun, in a match-day hard-court language.

Dial: ENERGY 3 / RHYTHM 2 / MOTION 2

- ENERGY 3: the court moments are bold (big italic type, the blue court, a row of balls).
- RHYTHM 2: two registers, so screens alternate between court moments and quiet cards instead of repeating one block.
- MOTION 2: motion only where it confirms something on court (score roll, point flash, winning sweep, page change, press). Nothing loops.

## Two registers

**Court**, for the moments people look at: the home hero, the join hero, every scoreboard (board, scorer, live view, TV), and the end-of-session hero and sticker.
- A blue hard court with inset white lines. A net line with a centre strap separates the two sides.
- White text, an italic uppercase display headline, and a small tracked eyebrow naming the moment.
- A row of tennis balls on the baseline, used only on hero cards.

**Simple**, for the work: setup, players, roster, results, standings, sheets and toasts.
- Light cards with 20px corners and hairline borders. Sentence-case headings and quiet type.
- Nothing decorative, so the court moments stand out.

## Frame and backdrop

- The header is the green frame (#0b5534) with the Saliiim logo (supplied by the owner on 2026-11-16): italic script with a court line, a flying ball and two sparks.
- Logo files live in `public/brand/` and are built from `design/saliiim-logo-source.webp` by `scripts/make-logo.py`. The original green version is for light surfaces. The header version has cream letters, the court line cut out so the green shows through, and the lime ball, swoosh and sparks unchanged.
- The app icon stays the 8-bit ball on clay. A logo this wide does not read at 16px.
- From 760px wide, the app sits in a rounded green frame on clay tiles, with two muted green balls in the corners, as in the reference. The balls are muted on purpose so they never compete with lime buttons.
- On phones the backdrop is off and the screen belongs to the app.

## Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--frame` | #0b5534 | #083d25 | Header, bottom nav, first-place row |
| `--court` | #4357cc | #2f3f9e | Court register surfaces (white text 6.05:1 / 9.03:1) |
| `--ball` | #d7f13b | #d7f13b | The one accent: primary pill, active tab, selection, the winner |
| `--clay` | #7a2d1b | #3f180e | Backdrop only, from 760px |
| `--bg` / `--card` | #f8f9f4 / #fefefb | #0d1511 / #17211c | Simple register |
| `--ink` / `--muted` | #11241a / #55625a | #eef2ea / #a3b0a7 | Text (muted 5.79:1 light, 8.23:1 dark) |
| `--danger` | #b3261e | #ff8a80 | LIVE and destructive actions |

## Type

- **Archivo (variable), with italic.** Italic heavy uppercase is the court voice (headlines, scores). Upright Archivo is used for everything else. It is a single family, bundled so it works offline.
- Scores use tabular italic digits. Headlines scale with screen width.

## Shape

- Buttons are pills, because they are the reference's tappable shape and read as "press me" at a glance. Lime marks the one primary action per screen.
- Cards have 20px corners, fields 12px, courts 24px, tags 6px. Radius marks the register, not decoration.
- The main action sits in a sticky bar at thumb height. The bottom nav is a floating green pill.
- Targets are at least 44px. Score halves are 168px tall.
- One glass element only: the sticky action bar, blurred so the list scrolling behind it stays readable.

## Voice

- English and Jaksel (Jakarta Indonesian-English mix). Short, warm, a bit cheeky: "Gas, mulai match!", "No tipu-tipu."
- Tennis terms stay English in both languages.
- No buzzwords and no em dashes.

## Reference boundary

The references guided the visual language (court, balls, frame, italic type, pills). Saliiim keeps its own name, wordmark, copy, screens and flows. Nothing is copied from the referenced product.
