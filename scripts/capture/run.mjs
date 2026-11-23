// Marketing capture kit: `npm run capture` (options below). Builds a demo session in the browser,
// screenshots every screen and records tutorial videos framed for 9:16 and 1:1.
//
//   npm run capture                          everything, English and Jaksel
//   npm run capture -- --only screens        screenshots only (about 3 minutes)
//   npm run capture -- --only videos --lang jksl --flows score,close
//
// Output: captures/<date-time>/ with screens/, stickers/, videos/ and a README.md describing each file.
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { chromium, startServer } from './lib.mjs';
import { compose, hasFfmpeg } from './compose.mjs';
import { takeShots } from './shots.mjs';
import { CAPTIONS, END_CARD, record } from './videos.mjs';
import { buildWorld, SESSION_NAME } from './world.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const only = args.only ?? 'all';
const langs = !args.lang || args.lang === 'both' ? ['en', 'jksl'] : [args.lang];
const flowIds = args.flows ? args.flows.split(',') : Object.keys(CAPTIONS);
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = resolve(args.out ?? join('captures', stamp));
mkdirSync(out, { recursive: true });

const stop = await startServer();
const browser = await chromium.launch();
const lines = [];
try {
  console.log('Building the demo session…');
  const world = await buildWorld(browser);

  if (only === 'all' || only === 'screens') {
    console.log('Screenshots…');
    const rows = await takeShots(browser, world, langs, out);
    lines.push('## Screenshots', '', 'Phone size (390 x 844 points), saved at 3x: 1170 x 2532 px. `-full` files show the whole scrolling page.', '');
    for (const lang of langs) {
      lines.push(`### ${lang === 'en' ? 'English' : 'Jaksel'}`, '', '| File | Shows |', '| --- | --- |');
      for (const r of rows.filter((x) => x.lang === lang)) lines.push(`| \`${r.file}\`${r.full ? ' (+ `-full`)' : ''} | ${r.what}${r.theme === 'dark' ? ' (dark mode)' : ''} |`);
      lines.push('');
    }
    lines.push('Stickers from the end of the session, one per colour: `stickers/<lang>-<colour>.png` (1600 x 900, see-through corners).', '');
  }

  if (only === 'all' || only === 'videos') {
    const ffmpeg = hasFfmpeg();
    if (!ffmpeg) throw new Error('Videos need ffmpeg with libx264 (Claude Code cloud sessions have it). Run with --only screens, or install ffmpeg.');
    console.log('Videos…');
    lines.push('## Videos', '', 'H.264 MP4, 30 fps. `-vertical` is 1080 x 1920 (Reels, TikTok, Stories); `-square` is 1080 x 1080 (feed, WhatsApp).',
      'No sound: add music in the editor. `phone/` has the same recordings without the frame (780 x 1688), for your own edits.', '');
    lines.push('| File | Flow | Captions |', '| --- | --- | --- |');
    const work = join(out, '.work');
    for (const lang of langs) {
      for (const id of flowIds) {
        const c = CAPTIONS[id];
        if (!c) continue;
        const rec = await record(browser, world, lang, id, join(work, 'raw'));
        const base = `videos/${lang}/${id}`;
        mkdirSync(join(out, 'videos', lang), { recursive: true });
        for (const shape of ['vertical', 'square']) {
          await compose(browser, rec, shape, c[lang], c.title[lang], END_CARD[lang], join(work, lang, id), join(out, `${base}-${shape}.mp4`));
        }
        mkdirSync(join(out, 'videos', 'phone'), { recursive: true });
        copyFileSync(rec.raw, join(out, 'videos', 'phone', `${lang}-${id}.mp4`));
        lines.push(`| \`${base}-vertical.mp4\`, \`${base}-square.mp4\` | ${c.title.en} | ${c[lang].join(' / ')} |`);
        console.log(`  ${lang}/${id} done`);
      }
    }
    rmSync(work, { recursive: true, force: true });
    lines.push('');
  }

  writeFileSync(join(out, 'README.md'), [
    `# Saliiim captures, ${stamp}`,
    '',
    `Made by \`npm run capture\` from the app's demo mode: a doubles session called "${SESSION_NAME}" on two courts,`,
    'with made-up players (Dimas hosts; Sari and Rina have accounts). No real users or data appear anywhere.',
    '',
    ...lines,
  ].join('\n'));
  console.log(`\nDone: ${relative(process.cwd(), out)}/README.md`);
} finally {
  await browser.close();
  stop();
}
