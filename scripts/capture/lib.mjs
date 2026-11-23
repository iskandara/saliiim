// Shared helpers for the marketing capture kit: the dev server, phones, labels and timing.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { en, jksl } from '../../src/i18n/strings.ts';

const require = createRequire(import.meta.url);
/** Playwright: installed in Claude Code cloud sessions; elsewhere `npm i -D playwright && npx playwright install chromium`. */
export const { chromium } = require('playwright');

export const PORT = 5199;
export const BASE = `http://localhost:${PORT}`;
export const PHONE = { width: 390, height: 844 };
export const LANGS = { en, jksl };

/** UI label in a language, so the scripts click what the screen actually says. */
export const label = (lang, key, vars = {}) =>
  LANGS[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts Vite in demo mode (no Supabase: everything lives in the browser). */
export async function startServer() {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_SUPABASE_ANON_KEY: '', VITE_TURNSTILE_SITE_KEY: '' };
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { env, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return () => process.kill(-proc.pid);
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  process.kill(-proc.pid);
  throw new Error(`Vite did not start on port ${PORT}. Is something else using it?`);
}

/** Every page: language, theme, capture mode (no demo banner) and a visible tap marker for tutorials. */
export function prefsScript({ lang, theme }) {
  return `
    try {
      localStorage.setItem('saliiim:lang', ${JSON.stringify(lang)});
      localStorage.setItem('saliiim:theme', ${JSON.stringify(theme)});
      localStorage.setItem('saliiim:capture', '1');
      localStorage.setItem('saliiim:install-dismissed', '1');
    } catch {}
    addEventListener('pointerdown', (e) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;border-radius:50%;' +
        'left:' + (e.clientX - 22) + 'px;top:' + (e.clientY - 22) + 'px;background:rgba(215,241,59,.55);' +
        'border:2px solid rgba(17,36,26,.55);transition:transform .45s ease-out,opacity .45s ease-out';
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0'; });
      setTimeout(() => d.remove(), 500);
    }, true);
  `;
}

/** A tab is one "phone": its device id decides who it is in demo mode. */
export async function phone(ctx, device) {
  const page = await ctx.newPage();
  await page.addInitScript((d) => {
    try {
      sessionStorage.setItem('saliiim:local:device', d);
    } catch {}
  }, device);
  return page;
}

/** Waits for the app to settle after a navigation or tap. */
export async function settle(page, ms = 450) {
  await page.waitForLoadState('domcontentloaded');
  await sleep(ms);
}
