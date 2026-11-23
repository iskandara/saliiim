// Frames a raw phone recording for social: 9:16 (1080x1920) and 1:1 (1080x1080), with the brand
// background, a phone bezel, timed captions and an end card. Needs ffmpeg with libx264.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PHONE } from './lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const FONT = pathToFileURL(join(ROOT, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-italic.woff2')).href;
const FONT_UP = pathToFileURL(join(ROOT, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2')).href;
const LOGO = pathToFileURL(join(ROOT, 'public/brand/logo-reverse-720.png')).href;

/** Screen size and position of the phone in each shape; captions sit above (9:16) or beside (1:1). */
export const SHAPES = {
  vertical: { w: 1080, h: 1920, screen: { x: 240, y: 520, w: 600, h: Math.round((600 * PHONE.height) / PHONE.width) }, cap: { x: 60, y: 170, w: 960, h: 300 } },
  square: { w: 1080, h: 1080, screen: { x: 595, y: 80, w: 425, h: Math.round((425 * PHONE.height) / PHONE.width) }, cap: { x: 60, y: 300, w: 480, h: 480 } },
};

export function hasFfmpeg() {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).includes('libx264');
  } catch {
    return false;
  }
}

const head = `<meta charset="utf-8"><style>
@font-face { font-family: A; src: url('${FONT}'); font-style: italic; font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: A; src: url('${FONT_UP}'); font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; }
html, body { margin: 0; background: transparent; }
* { box-sizing: border-box; }
</style>`;

async function png(browser, html, w, h, file) {
  const tmp = `${file}.html`;
  writeFileSync(tmp, `<!doctype html><html><head>${head}</head><body>${html}</body></html>`);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
}

const ball = (x, y, size) =>
  `<svg style="position:absolute;left:${x}px;top:${y}px;opacity:.55" width="${size}" height="${size}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#4f8b2a"/><path d="M5.5 5.5c5 4.5 5 16.5 0 21M26.5 5.5c-5 4.5-5 16.5 0 21" fill="none" stroke="rgba(210,214,205,.85)" stroke-width="1.4"/></svg>`;

/** Background, bezel, captions and end card for one shape and language. */
async function assets(browser, shape, flowCaptions, title, endCard, dir) {
  const S = SHAPES[shape];
  const sc = S.screen;
  const vertical = shape === 'vertical';
  const files = { bg: join(dir, 'bg.png'), bezel: join(dir, 'bezel.png'), caps: [], end: join(dir, 'end.png') };
  const logo = vertical
    ? `<img src="${LOGO}" style="position:absolute;left:60px;top:64px;height:76px">`
    : `<img src="${LOGO}" style="position:absolute;left:60px;top:70px;height:70px">`;
  await png(browser, `<div style="position:relative;width:${S.w}px;height:${S.h}px;background:#0b5534;overflow:hidden">
      ${ball(S.w - 260, vertical ? 1600 : 760, 380)}${ball(-140, vertical ? 1280 : 820, 300)}${logo}
      <div style="position:absolute;right:60px;top:${vertical ? 84 : 92}px;font:700 28px A;color:#d7f13b;letter-spacing:.12em;text-transform:uppercase">${title}</div>
    </div>`, S.w, S.h, files.bg);
  // Bezel: a dark ring whose inner corners hide the video's square corners.
  await png(browser, `<div style="position:absolute;left:${sc.x - 20}px;top:${sc.y - 20}px;width:${sc.w + 40}px;height:${sc.h + 40}px;
      border:20px solid #11241a;border-radius:72px;box-shadow:0 30px 80px rgba(0,0,0,.45)"></div>`, S.w, S.h, files.bezel);
  const C = S.cap;
  for (const [i, text] of flowCaptions.entries()) {
    const f = join(dir, `cap-${i}.png`);
    await png(browser, `<div style="width:${C.w}px;height:${C.h}px;display:flex;flex-direction:column;justify-content:${vertical ? 'flex-end' : 'center'};gap:18px">
        <div style="width:64px;height:64px;border-radius:50%;background:#d7f13b;color:#11241a;display:grid;place-items:center;font:italic 900 34px A">${i + 1}</div>
        <div style="font:italic 900 ${vertical ? 76 : 60}px/0.98 A;font-stretch:110%;text-transform:uppercase;color:#fff;text-wrap:balance">${text}</div>
      </div>`, C.w, C.h, f);
    files.caps.push(f);
  }
  await png(browser, `<div style="width:${C.w}px;height:${C.h}px;display:flex;flex-direction:column;justify-content:${vertical ? 'flex-end' : 'center'};gap:22px">
      <div style="font:italic 900 ${vertical ? 76 : 60}px/0.98 A;font-stretch:110%;text-transform:uppercase;color:#d7f13b;text-wrap:balance">${endCard.line}</div>
      <div style="font:600 34px A;color:#fff">${endCard.url}</div>
    </div>`, C.w, C.h, files.end);
  return files;
}

/** Writes <out>/<name>.mp4 for one shape. Returns the file path. */
export async function compose(browser, rec, shape, captions, title, endCard, workDir, outFile) {
  const S = SHAPES[shape];
  const dir = join(workDir, shape);
  mkdirSync(dir, { recursive: true });
  const a = await assets(browser, shape, captions, title, endCard, dir);
  const endAt = Math.max(rec.total - 2.6, (rec.marks.at(-1)?.t ?? 0) + 1.5);
  const duration = endAt + 2.6;
  const inputs = ['-loop', '1', '-i', a.bg, '-ss', rec.trim.toFixed(2), '-i', rec.raw, '-loop', '1', '-i', a.bezel];
  let graph = `[1:v]scale=${S.screen.w}:${S.screen.h},setsar=1,fps=30[ph];[0:v][ph]overlay=${S.screen.x}:${S.screen.y}[v0];[v0][2:v]overlay=0:0[v1]`;
  let last = 'v1';
  rec.marks.forEach((m, k) => {
    const from = m.t;
    const to = Math.min(rec.marks[k + 1]?.t ?? endAt, endAt);
    inputs.push('-loop', '1', '-i', a.caps[m.i]);
    const idx = 3 + k;
    graph += `;[${last}][${idx}:v]overlay=${S.cap.x}:${S.cap.y}:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'[c${k}]`;
    last = `c${k}`;
  });
  inputs.push('-loop', '1', '-i', a.end);
  graph += `;[${last}][${3 + rec.marks.length}:v]overlay=${S.cap.x}:${S.cap.y}:enable='gte(t,${endAt.toFixed(2)})'[out]`;
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]',
    '-t', duration.toFixed(2), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
  return outFile;
}
