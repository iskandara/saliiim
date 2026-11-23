// Builds the demo "world" once: a Saturday doubles session with realistic names and results,
// saved as browser snapshots at each stage so screenshots and videos can start from any of them.
import { BASE, label, phone, prefsScript, settle, sleep } from './lib.mjs';

export const SESSION_NAME = 'Sabtu Pagi Senayan';
/** Players typed in by the host; Sari and Rina join from their own phones and have accounts. */
export const TYPED = ['Bayu', 'Andre', 'Tari', 'Yoga', 'Nadia'];

const account = (id, name, email) => ({ id, name, email, avatarUrl: null });
const profile = (id, name, startLevel, rating, extra = {}) => ({
  id, name, photoUrl: null, city: 'Jakarta', hand: 'right', formatPref: 'doubles', startLevel, rating, ratedMatches: 0,
  isPublic: true, showBasics: true, showStats: true, showH2h: true, showHistory: true, ...extra,
});

/** Final scores the host types in, round by round (games to 4). */
const SCORES = [[4, 2], [3, 4], [4, 1], [4, 3], [2, 4], [4, 0], [4, 2], [1, 4], [4, 3], [3, 4]];

/** Types a final score on the first court that has a match in play. Returns false when none has. */
async function enterScore(page, lang, [a, b]) {
  const btn = page.locator('.courts').getByRole('button', { name: label(lang, 'enter_score') }).first();
  if (!(await btn.count())) return false;
  await btn.click();
  const plus = (i) => page.locator('.enter-row').nth(i).getByRole('button', { name: /\+$/ });
  for (let k = 0; k < a; k++) await plus(0).click();
  for (let k = 0; k < b; k++) await plus(1).click();
  await page.getByRole('button', { name: label(lang, 'enter_save') }).click();
  await settle(page, 350);
  return true;
}

export async function buildWorld(browser) {
  const lang = 'en';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(prefsScript({ lang, theme: 'light' }));
  const snaps = {};
  const host = await phone(ctx, 'dev-dimas');
  await host.goto(BASE);
  await host.evaluate(
    ({ accounts, profiles }) => {
      localStorage.setItem('saliiim:local:accounts', JSON.stringify(accounts));
      localStorage.setItem('saliiim:local:profiles', JSON.stringify(profiles));
    },
    {
      accounts: {
        'dev-dimas': account('dev-dimas', 'Dimas', 'dimas@example.com'),
        'dev-sari': account('dev-sari', 'Sari', 'sari@example.com'),
        'dev-rina': account('dev-rina', 'Rina', 'rina@example.com'),
        'dev-new': account('dev-new', 'Putri', 'putri@example.com'),
      },
      profiles: {
        'dev-dimas': profile('dev-dimas', 'Dimas', 'intermediate', 1200),
        'dev-sari': profile('dev-sari', 'Sari', 'advanced', 1600, { hand: 'left' }),
        'dev-rina': profile('dev-rina', 'Rina', 'intermediate', 1200, { formatPref: 'both' }),
      },
    },
  );
  snaps.signedIn = await ctx.storageState();

  // Set up: doubles, two courts.
  await host.goto(`${BASE}/new`);
  await settle(host);
  await host.locator('#session-name').fill(SESSION_NAME);
  await host.getByRole('button', { name: `${label(lang, 'courts')} +` }).click();
  await host.locator('.cta-bar button').click();
  await host.locator('.sheet .actions button').last().click();
  await host.waitForURL(/players$/);
  const sid = host.url().split('/s/')[1].split('/')[0];
  const slug = await host.evaluate((id) => JSON.parse(localStorage.getItem('saliiim:local:sessions'))[id].slug, sid);

  for (const [dev, name] of [['dev-sari', 'Sari'], ['dev-rina', 'Rina']]) {
    const p = await phone(ctx, dev);
    await p.goto(`${BASE}/p/${slug}`);
    await settle(p);
    await p.getByRole('button', { name: label(lang, 'join_play') }).click();
    await p.locator('.hero form input').fill(name);
    await p.locator('.hero form button[type=submit]').click();
    await settle(p);
    await p.close();
  }
  for (const n of TYPED) {
    await host.locator('.add-name input').fill(n);
    await host.locator('.add-name button').click();
    await sleep(80);
  }
  await settle(host);
  snaps.draft = await ctx.storageState();

  await host.locator('.cta-bar button').click();
  await host.waitForURL(/\/s\/[^/]+$/);
  await settle(host);
  await host.locator('.hostlink .icon-btn').click().catch(() => {});
  snaps.liveFresh = await ctx.storageState();

  let n = 0;
  for (let k = 0; k < 2; k++) if (await enterScore(host, lang, SCORES[n])) n++;
  snaps.liveMid = await ctx.storageState();
  while (n < SCORES.length && (await enterScore(host, lang, SCORES[n]))) n++;
  snaps.liveLate = await ctx.storageState();

  if (!(await host.locator('.settings').evaluate((d) => d.open))) await host.locator('.settings summary').click();
  await host.locator('.end-session button').click();
  await host.locator('.sheet .actions button').last().click();
  await host.waitForURL(/summary$/);
  await settle(host, 800);
  snaps.closed = await ctx.storageState();
  await ctx.close();
  return { snaps, sid, slug };
}
