// Tutorial flows, recorded on a phone-sized screen at a human pace. Each step marks when its
// caption appears; compose.mjs then frames the recording for 9:16 and 1:1 with those captions.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, label, phone, PHONE, prefsScript, settle, sleep } from './lib.mjs';

/** Captions per flow and language. Keep them short: they sit above or beside the phone. */
export const CAPTIONS = {
  setup: {
    title: { en: 'Set up a session', jksl: 'Bikin sesi' },
    en: ['Start a new session', 'Pick format, courts and rules', 'Add players or share the link', 'Start, and courts fill themselves'],
    jksl: ['Bikin sesi baru', 'Pilih format, lapangan, aturan', 'Tambah pemain atau share link', 'Mulai, lapangan langsung keisi'],
  },
  score: {
    title: { en: 'Score live', jksl: 'Skor live' },
    en: ['Tap Start match on a court', 'Pick who serves first', 'Tap the side that won the point', 'Game, set, match: confirm it', 'The next match is already up'],
    jksl: ['Tap mulai match di lapangan', 'Pilih siapa yang servis', 'Tap tim yang dapet poin', 'Game, set, match: confirm', 'Match berikutnya langsung siap'],
  },
  join: {
    title: { en: 'Join from WhatsApp', jksl: 'Join dari WhatsApp' },
    en: ['Friends open your WhatsApp link', 'They join with just a name', "They see when they're up"],
    jksl: ['Temen buka link dari WhatsApp', 'Join cukup pakai nama', 'Langsung tau kapan main'],
  },
  close: {
    title: { en: 'Wrap up', jksl: 'Udahan' },
    en: ["Close the session when you're done", 'Final standings and level changes', 'Download a sticker for your story'],
    jksl: ['Tutup sesi kalau udah kelar', 'Klasemen akhir dan perubahan level', 'Download stiker buat story lo'],
  },
  profile: {
    title: { en: 'Your profile', jksl: 'Profil lo' },
    en: ['Your level, after every session', 'Stats, partners and rivals', 'Every match, saved'],
    jksl: ['Level lo, update tiap sesi', 'Statistik, partner, dan lawan', 'Semua match kesimpen'],
  },
};

export const END_CARD = {
  en: { line: 'Run your next session on Saliiim', url: 'saliiim.iskandara.workers.dev' },
  jksl: { line: 'Bikin match lo di Saliiim', url: 'saliiim.iskandara.workers.dev' },
};

const smoothTo = async (page, selector) => {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await sleep(1100);
};
const smoothBy = async (page, y) => {
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), y);
  await sleep(1100);
};

/** Each flow: the story stage it starts from, whose phone it is, and the steps. */
export function flows({ sid, slug }) {
  return {
    setup: {
      snap: 'signedIn', device: 'dev-dimas', path: '/',
      run: async (page, { lang, cap }) => {
        cap(0);
        await sleep(1300);
        await page.locator('.hero .btn').click();
        cap(1);
        await settle(page, 700);
        await page.locator('#session-name').pressSequentially('Sabtu Pagi Senayan', { delay: 55 });
        await sleep(400);
        await page.getByRole('button', { name: `${label(lang, 'courts')} +` }).click();
        await sleep(700);
        await smoothBy(page, 420);
        await page.locator('.cta-bar button').click();
        await sleep(1500);
        await page.locator('.sheet .actions button').last().click();
        await page.waitForURL(/players$/);
        await settle(page, 600);
        cap(2);
        for (const n of ['Bayu', 'Andre', 'Tari']) {
          await page.locator('.add-name input').pressSequentially(n, { delay: 70 });
          await page.locator('.add-name button').click();
          await sleep(450);
        }
        await sleep(600);
        cap(3);
        await page.locator('.cta-bar button').click();
        await page.waitForURL(/\/s\/[^/]+$/);
        await settle(page, 600);
        await page.locator('.hostlink .icon-btn').click().catch(() => {});
        await sleep(2200);
      },
    },
    score: {
      snap: 'liveFresh', device: 'dev-dimas', path: `/s/${sid}`,
      run: async (page, { lang, cap }) => {
        cap(0);
        await sleep(1400);
        await page.locator('.court .btn.primary').first().click();
        cap(1);
        await settle(page, 700);
        await sleep(900);
        await page.locator('.picker .pick').first().click();
        await sleep(500);
        cap(2);
        // A believable 4-1 match: a few points the other way.
        const pattern = [0, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
        for (let i = 0; i < 60; i++) {
          if (await page.locator('.gsm').count()) break;
          const btn = page.locator('.board .team').nth(i < pattern.length ? pattern[i] : 0);
          if (await btn.isDisabled()) break;
          await btn.click();
          await sleep(i < 8 ? 420 : 230);
        }
        cap(3);
        await sleep(1400);
        await page.getByRole('button', { name: label(lang, 'confirm_result') }).click();
        await settle(page, 500);
        if (!/\/s\/[^/]+$/.test(page.url())) await page.goto(`${BASE}/s/${sid}`);
        await settle(page, 500);
        cap(4);
        await sleep(2200);
      },
    },
    join: {
      snap: 'draft', device: 'dev-guest', path: `/p/${slug}`,
      run: async (page, { lang, cap, ctx }) => {
        cap(0);
        await sleep(1800);
        await page.getByRole('button', { name: label(lang, 'join_play') }).click();
        await sleep(500);
        cap(1);
        await page.locator('.hero form input').pressSequentially('Putra', { delay: 90 });
        await sleep(300);
        await page.locator('.hero form button[type=submit]').click();
        await settle(page, 1200);
        // The host starts the session on their own phone (not filmed).
        const host = await phone(ctx, 'dev-dimas');
        await host.goto(`${BASE}/s/${sid}/players`);
        await settle(host, 500);
        await host.locator('.cta-bar button').click();
        await page.bringToFront();
        await sleep(900);
        cap(2);
        await sleep(2600);
        await host.close();
      },
    },
    close: {
      snap: 'liveLate', device: 'dev-dimas', path: `/s/${sid}`,
      run: async (page, { cap }) => {
        cap(0);
        await sleep(1000);
        await smoothTo(page, '.settings');
        await page.locator('.settings summary').click();
        await sleep(700);
        await page.locator('.end-session button').click();
        await sleep(1300);
        await page.locator('.sheet .actions button').last().click();
        await page.waitForURL(/summary$/);
        await settle(page, 1300);
        cap(1);
        await sleep(1200);
        await smoothBy(page, 520);
        await sleep(800);
        cap(2);
        await smoothTo(page, '.swatches');
        for (const i of [1, 2, 3, 0]) {
          await page.locator('.swatches button').nth(i).click();
          await sleep(750);
        }
        await sleep(1200);
      },
    },
    profile: {
      snap: 'closed', device: 'dev-dimas', path: '/u/dev-dimas',
      run: async (page, { cap }) => {
        cap(0);
        await sleep(2000);
        cap(1);
        await smoothTo(page, '.stats');
        await sleep(1600);
        await smoothBy(page, 420);
        await sleep(1000);
        cap(2);
        await smoothTo(page, '.history-session');
        await sleep(2400);
      },
    },
  };
}

/**
 * Records one flow at full phone resolution (780 x 1688) from Chrome's screencast, then turns the
 * frames into a constant 30 fps MP4. Returns the video and when each caption starts (seconds).
 */
export async function record(browser, world, lang, flowId, dir) {
  const flow = flows(world)[flowId];
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, storageState: world.snaps[flow.snap] });
  await ctx.addInitScript(prefsScript({ lang, theme: 'light' }));
  const page = await phone(ctx, flow.device);
  await page.goto(BASE + flow.path);
  await settle(page, 900);

  const frameDir = join(dir, `${lang}-${flowId}-frames`);
  mkdirSync(frameDir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, at: metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const t0 = Date.now();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: PHONE.width * 2, maxHeight: PHONE.height * 2 });
  // Nudge one frame out even if nothing moves yet.
  await page.evaluate(() => window.scrollBy(0, 0));
  const marks = [];
  await flow.run(page, { lang, ctx, world, cap: (i) => marks.push({ i, t: (Date.now() - t0) / 1000 }) });
  const total = (Date.now() - t0) / 1000;
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close();
  if (!frames.length) throw new Error(`no frames recorded for ${flowId}`);

  // Each frame shows until the next one; the last one holds to the end.
  const list = join(frameDir, 'frames.txt');
  const lines = [];
  frames.forEach((f, k) => {
    const start = k === 0 ? t0 : f.at;
    const end = k + 1 < frames.length ? frames[k + 1].at : t0 + total * 1000;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (end - start) / 1000).toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(list, lines.join('\n'));
  const raw = join(dir, `${lang}-${flowId}.mp4`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=${PHONE.width * 2}:${PHONE.height * 2}:force_original_aspect_ratio=decrease,pad=${PHONE.width * 2}:${PHONE.height * 2},fps=30`,
    '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', raw]);
  return { raw, trim: 0, marks, total };
}
