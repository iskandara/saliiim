// Screenshots of every screen, in each language, at phone size (3x pixels), plus a few in dark mode.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, label, phone, PHONE, prefsScript, settle, sleep } from './lib.mjs';

const STICKER_THEMES = ['court', 'clay', 'grass', 'night', 'clear-white', 'clear-dark'];

/** Taps points until the match is won or the tap limit is reached. */
async function tapPoints(page, pattern, max) {
  if (await page.locator('.picker .pick').count()) await page.locator('.picker .pick').first().click();
  for (let i = 0; i < max; i++) {
    if (await page.locator('.gsm').count()) return;
    const team = pattern[i % pattern.length];
    const btn = page.locator('.board .team').nth(team);
    if (await btn.isDisabled()) return;
    await btn.click();
    await sleep(60);
  }
}

/**
 * Each shot: which stage of the story, which phone, which page, and what to tap first.
 * `what` goes into the README the run writes, so content makers know what each image shows.
 */
export function shotList({ sid, slug }) {
  const board = `/s/${sid}`;
  return [
    { name: 'home', what: 'Home for a new visitor: the hero and "Sign in to host"', snap: 'signedIn', device: 'dev-guest', path: '/', dark: true },
    { name: 'sign-in', what: 'Sign-in sheet: Google or a 6-digit email code', snap: 'signedIn', device: 'dev-guest', path: '/', prep: (p) => p.locator('.hero .btn').click() },
    { name: 'welcome', what: 'First sign-in: name and starting level', snap: 'signedIn', device: 'dev-new', path: '/welcome' },
    { name: 'home-signed-in', what: 'Home when signed in: your sessions on any phone', snap: 'closed', device: 'dev-dimas', path: '/' },
    {
      name: 'setup', what: 'New session: format, partners, courts', snap: 'signedIn', device: 'dev-dimas', path: '/new',
      prep: async (p, lang) => {
        await p.locator('#session-name').fill('Sabtu Pagi Senayan');
        await p.getByRole('button', { name: `${label(lang, 'courts')} +` }).click();
      },
    },
    {
      name: 'setup-review', what: 'Review sheet before creating the session', snap: 'signedIn', device: 'dev-dimas', path: '/new',
      prep: async (p, lang) => {
        await p.locator('#session-name').fill('Sabtu Pagi Senayan');
        await p.getByRole('button', { name: `${label(lang, 'courts')} +` }).click();
        await p.locator('.cta-bar button').click();
      },
    },
    { name: 'players', what: 'Players screen: who joined by link and who was typed in', snap: 'draft', device: 'dev-dimas', path: `${board}/players`, full: true },
    { name: 'invite', what: 'What a friend sees when they open the WhatsApp link', snap: 'draft', device: 'dev-guest', path: `/p/${slug}` },
    { name: 'joined', what: 'A player who joined, waiting for the start', snap: 'draft', device: 'dev-sari', path: `/p/${slug}` },
    { name: 'board', what: 'Courts board (host): live courts, numbered Next up', snap: 'liveMid', device: 'dev-dimas', path: board, full: true, dark: true },
    { name: 'scoring', what: 'Scoring a court: tap the side that won the point', snap: 'liveMid', device: 'dev-dimas', path: `${board}/court/1`, dark: true, prep: (p) => tapPoints(p, [0, 0, 1, 0, 1, 0, 0], 7) },
    { name: 'match-won', what: 'Game, set, match: the result waits for a confirm', snap: 'liveMid', device: 'dev-dimas', path: `${board}/court/1`, prep: (p) => tapPoints(p, [0, 0, 0, 1], 60) },
    {
      name: 'enter-score', what: 'Typing in a final score instead of scoring live', snap: 'liveMid', device: 'dev-dimas', path: board,
      prep: async (p, lang) => {
        await p.locator('.court').first().getByRole('button', { name: label(lang, 'enter_score') }).click();
        const plus = (i) => p.locator('.enter-row').nth(i).getByRole('button', { name: /\+$/ });
        for (let k = 0; k < 4; k++) await plus(0).click();
        for (let k = 0; k < 2; k++) await plus(1).click();
      },
    },
    { name: 'skip', what: 'Skip a match, or play it later', snap: 'liveMid', device: 'dev-dimas', path: board, prep: (p, lang) => p.locator('.court').first().getByRole('button', { name: label(lang, 'skip') }).click() },
    { name: 'player-phone', what: "A player's own screen during the session", snap: 'liveMid', device: 'dev-sari', path: `/p/${slug}`, full: true },
    { name: 'roster', what: 'Players and pairs during the session: mark left, add late arrivals', snap: 'liveMid', device: 'dev-dimas', path: `${board}/roster` },
    { name: 'standings', what: 'Standings: win rate, then game difference', snap: 'liveLate', device: 'dev-dimas', path: `${board}/standings`, full: true },
    { name: 'live-view', what: 'Live view for spectators', snap: 'liveLate', device: 'dev-dimas', path: `${board}/live`, full: true },
    { name: 'tv', what: 'TV mode for a screen at the club', snap: 'liveLate', device: 'dev-dimas', path: `/p/${slug}/tv`, size: { width: 1280, height: 720 } },
    { name: 'summary', what: 'End of session: level changes, stats, sticker, feedback', snap: 'closed', device: 'dev-dimas', path: `${board}/summary`, full: true, dark: true, stickers: true },
    { name: 'player-summary', what: "A signed-in player's summary", snap: 'closed', device: 'dev-rina', path: `/p/${slug}`, full: true },
    { name: 'profile', what: 'Profile: level, career stats, head-to-head, match history', snap: 'closed', device: 'dev-dimas', path: '/u/dev-dimas', full: true, dark: true },
    { name: 'profile-other', what: "Someone else's public profile", snap: 'closed', device: 'dev-dimas', path: '/u/dev-sari', full: true },
    { name: 'settings', what: 'Profile settings: details and who can see what', snap: 'closed', device: 'dev-dimas', path: '/settings', full: true },
    { name: 'feedback', what: 'Feedback form', snap: 'signedIn', device: 'dev-guest', path: '/feedback' },
  ];
}

export async function takeShots(browser, world, langs, out) {
  const rows = [];
  const list = shotList(world);
  for (const lang of langs) {
    for (const theme of ['light', 'dark']) {
      const dir = join(out, 'screens', lang, theme);
      mkdirSync(dir, { recursive: true });
      for (const [i, s] of list.entries()) {
        if (theme === 'dark' && !s.dark) continue;
        const ctx = await browser.newContext({ viewport: s.size ?? PHONE, deviceScaleFactor: s.size ? 2 : 3, storageState: world.snaps[s.snap] });
        await ctx.addInitScript(prefsScript({ lang, theme }));
        const page = await phone(ctx, s.device);
        const file = `${String(i + 1).padStart(2, '0')}-${s.name}`;
        try {
          await page.goto(BASE + s.path);
          await settle(page, 700);
          if (s.prep) {
            await s.prep(page, lang);
            await settle(page, 500);
          }
          await page.screenshot({ path: join(dir, `${file}.png`) });
          if (s.full) await page.screenshot({ path: join(dir, `${file}-full.png`), fullPage: true });
          if (s.stickers && theme === 'light') await saveStickers(page, join(out, 'stickers'), lang);
          rows.push({ lang, theme, file: `screens/${lang}/${theme}/${file}.png`, full: !!s.full, what: s.what });
        } catch (e) {
          console.warn(`  ! ${lang}/${theme}/${file}: ${String(e.message).split('\n')[0]}`);
        }
        await ctx.close();
      }
      console.log(`  screens ${lang}/${theme} done`);
    }
  }
  return rows;
}

async function saveStickers(page, dir, lang) {
  mkdirSync(dir, { recursive: true });
  const swatches = page.locator('.swatches button');
  const n = await swatches.count();
  for (let i = 0; i < n; i++) {
    await swatches.nth(i).click();
    await sleep(500);
    const src = await page.locator('.sticker-preview img').getAttribute('src');
    if (src?.startsWith('data:image/png;base64,')) {
      writeFileSync(join(dir, `${lang}-${STICKER_THEMES[i] ?? i}.png`), Buffer.from(src.split(',')[1], 'base64'));
    }
  }
}
