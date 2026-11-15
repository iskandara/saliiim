# Saliiim design direction

Source: the M1 mockup and PRD by the Saliiim team. This file records that direction so later changes keep to it.

Design Read: courtside session tool for casual tennis groups in Indonesia, used one-handed on mid-range Android phones in bright sun, in a tennis-club scoreboard language.

Dial: ENERGY 2 / RHYTHM 1 / MOTION 2

- ENERGY 2: confident and playful (burst logo, Jaksel voice), but the scoreboard is the loudest thing on screen.
- RHYTHM 1: screens are tools, so sections stay predictable. People scan them mid-match.
- MOTION 2: motion only where it confirms something on court (score roll, point flash, winning sweep, page change). Nothing loops.

## Identity

A tennis court and its scoreboard. Players should feel they are looking at the club's own board, not an app.

- **Court green and cream scoreboard halves.** Team A sits on cream and team B on green, like the two lines of a club scoreboard.
- **Net band.** The masthead ends in a net with a white tape and centre strap. During a session only the white tape remains, to save space.
- **Grass stripes.** A faint vertical stripe texture on green surfaces reads as a mown court. It is used only on green, never on cream.
- **Burst logo.** "Saliiim!" in ball yellow inside a star burst: the shout when a point is won.

## Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--green` | #1f5a2e | #1b4a27 | Court: masthead, team B, first place |
| `--ball` | #d9f03a | #d9f03a | The one accent: primary actions, selection, the winning moment |
| `--bg` / `--surface` | #f3f0e6 / #fbfaf5 | #0e1a12 / #15251a | Cream page and panels (dark: night court) |
| `--ink` | #0f2a17 | #eef3e6 | Text and 2px borders |
| `--danger` | #b3261e | #ff8a80 | LIVE badge and destructive actions, one red only |
| `--focus` | #0f2a17 | #d9f03a | Keyboard focus ring (ink on cream, ball yellow at night) |

Ball yellow is the only accent. It marks what to tap next, and the winner.

## Type

- **Display: Archivo (variable).** A sturdy sports grotesk with strong numerals and width control, used for headings, the logo and every score. It is bundled with the app so it works offline at the courts.
- **Body: the system font.** It loads instantly and reads well at small sizes in sun.
- Scores use tabular digits, so numbers don't jump sideways as they change.

## Shape and components

- Square corners and 2px ink borders everywhere: it should look like a printed board, not a rounded app. No shadows, glass or glow.
- Tap targets are at least 44px. The score blocks are 150px tall, since they are tapped one-handed mid-rally.

## Voice

- English and Jaksel (Jakarta Indonesian-English mix). Short, warm, a bit cheeky: "Gas, mulai match!", "No tipu-tipu."
- Tennis terms stay English in both languages.
- No buzzwords and no em dashes.
