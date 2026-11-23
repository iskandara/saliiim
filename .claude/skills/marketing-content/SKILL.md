---
name: marketing-content
description: Make Saliiim marketing content (Instagram and TikTok Reels, feed posts, WhatsApp messages, carousel slides, tutorial clips) from up-to-date screenshots and screen recordings of the app. Use when asked for posts, captions, Reels, tutorials, promo images or videos about Saliiim.
---

# Saliiim marketing content

Content is built from the app as it is in this repo, never from memory: run the capture kit, then
pick, caption and write. CLAUDE.md lists what is live; only promote what is listed there.

## 1. Capture fresh material

```bash
npm install                      # once per session
npm run capture                  # everything, English and Jaksel: about 10 minutes
npm run capture -- --only screens --lang jksl          # just screenshots, one language
npm run capture -- --only videos --flows score,close   # just some videos
```

Output goes to `captures/<date-time>/` (git-ignored). Read its `README.md` first: it lists every
file and what it shows. Everything runs in demo mode with made-up players (Dimas hosts; Sari and
Rina have accounts), so no real person appears.

- `screens/<lang>/<light|dark>/NN-name.png`: phone screenshots, 1170 x 2532. `-full` = whole scrolling page.
- `stickers/<lang>-<colour>.png`: the end-of-session sticker in all six colours.
- `videos/<lang>/<flow>-vertical.mp4` (1080 x 1920) and `-square.mp4` (1080 x 1080): framed tutorials
  with captions and an end card. No sound.
- `videos/phone/<lang>-<flow>.mp4`: the same recordings unframed (780 x 1688), for custom edits.

Needs Chromium with Playwright, and ffmpeg with libx264 for videos. Claude Code cloud sessions have
both. On a laptop: `npm i -D playwright && npx playwright install chromium`, and install ffmpeg.

## 2. Pick the asset for the message

| Message | Best video | Best screens |
| --- | --- | --- |
| "Run the whole session from one phone" | `setup` | `05-setup`, `10-board`, `07-players` |
| "Live scores, no arguing" | `score` | `11-scoring`, `12-match-won` |
| "Friends join from a WhatsApp link, no app or account" | `join` | `08-invite`, `09-joined`, `15-player-phone` |
| "Standings that are fair" | `close` | `17-standings`, `18-live-view` |
| "Share your result" | `close` | `20-summary`, stickers |
| "Your level and stats" | `profile` | `22-profile`, `23-profile-other`, `20-summary` (level changes) |
| "Show it on the club TV" | none | `19-tv` |
| "Players can't make it / late arrivals" | none | `16-roster`, `14-skip` |

Dark-mode versions exist for home, board, scoring, summary and profile: good for night-match posts.

## 3. Write in Saliiim's voice

- Short, warm, a little cheeky. Jaksel for Jakarta audiences, English otherwise. Match the app's own
  lines in `src/i18n/strings.ts` (for example "Gas, mulai match!", "No tipu-tipu").
- Tennis terms stay English in both languages (deuce, tiebreak, doubles, match).
- No em dashes. No hype words ("revolutionary", "seamless", "game-changing"). Say what it does.
- Lead with the problem casual groups know: scores argued over, nobody remembers who played whom,
  the WhatsApp group full of "berapa berapa?".
- True claims only: free; players don't need an account; works with weak signal; up to 4 courts and
  16 players. Don't promise anything under "Coming next" in CLAUDE.md.
- Call to action: "Bikin match lo di Saliiim" / "Run your next session on Saliiim", with the live link.

## 4. Formats

- **Reels / TikTok (9:16):** use a `-vertical.mp4`. Hook in the first 2 seconds (on-screen text or
  the first caption), 15 to 30 seconds total, music added in the editor. Write the post caption
  plus 3 to 5 tennis hashtags, such as #tenisjakarta #tenisindonesia #mabartenis.
- **Feed post / carousel (1:1 or 4:5):** a `-square.mp4`, or screenshots placed on a branded slide.
  Carousel: one idea per slide, 4 to 6 slides, last slide is the call to action.
- **WhatsApp status / group message:** one square video or one sticker image, two lines of text, the link.

When making slides or edited images, keep the app's look (DESIGN.md): green frame `#0b5534`, court
blue `#4357cc`, lime `#d7f13b` for the one highlight, italic uppercase headlines (Archivo).

## 5. Deliver

Put finished pieces in one folder with a short list: file, format, caption text, and which feature it
shows. Note anything you could not make from the captures (for example a real crowd shot or voiceover).

## Changing the capture kit

- New screen: add an entry to `shotList` in `scripts/capture/shots.mjs` (which story stage, whose
  phone, which page, what to tap first, and a one-line `what`).
- New tutorial: add a flow in `scripts/capture/videos.mjs` with captions in both languages in `CAPTIONS`.
- Video framing (sizes, background, end card): `scripts/capture/compose.mjs`.
- The demo session itself (names, scores, courts): `scripts/capture/world.mjs`.
