export type StickerTheme = 'court' | 'clay' | 'grass' | 'night' | 'clear_light' | 'clear_dark';

export const STICKER_THEMES: StickerTheme[] = ['court', 'clay', 'grass', 'night', 'clear_light', 'clear_dark'];

interface Theme {
  /** Card colours; the clear themes have no card, only type over the photo. */
  frame?: string;
  surface?: string;
  lines?: string;
  ink: string;
  accent: string;
  logo: 'reverse' | 'green';
  /** Soft shadow under the type so white text reads on a busy photo. */
  shadow?: string;
}

const THEMES: Record<StickerTheme, Theme> = {
  court: { frame: '#0b5534', surface: '#4357cc', lines: 'rgba(255,255,255,0.5)', ink: '#ffffff', accent: '#d7f13b', logo: 'reverse' },
  clay: { frame: '#7a2d1b', surface: '#b8552f', lines: 'rgba(255,255,255,0.55)', ink: '#ffffff', accent: '#d7f13b', logo: 'reverse' },
  grass: { frame: '#0b5534', surface: '#3d7f3a', lines: 'rgba(255,255,255,0.55)', ink: '#ffffff', accent: '#d7f13b', logo: 'reverse' },
  night: { frame: '#0b5534', surface: '#0d1511', lines: 'rgba(215,241,59,0.35)', ink: '#ffffff', accent: '#d7f13b', logo: 'reverse' },
  clear_light: { ink: '#ffffff', accent: '#d7f13b', logo: 'reverse', shadow: 'rgba(0,0,0,0.55)' },
  clear_dark: { ink: '#11241a', accent: '#0b5534', logo: 'green' },
};

/** Swatch colour for the picker. */
export function themeSwatch(theme: StickerTheme): string {
  const th = THEMES[theme];
  return th.surface ?? (theme === 'clear_light' ? '#ffffff' : '#11241a');
}

/** Whether the preview needs a dark backdrop to show the white type. */
export const needsDarkPreview = (theme: StickerTheme) => theme === 'clear_light';

export interface StickerData {
  theme: StickerTheme;
  session: string;
  date: string;
  label: string;
  name: string;
  stats: [string, string][];
  /** Promotional line along the bottom. */
  promo: string;
  /** Logo for this theme; the typed wordmark is the fallback if it failed to load. */
  logo?: HTMLImageElement | null;
}

export function loadLogo(theme: StickerTheme): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = THEMES[theme].logo === 'green' ? '/brand/logo-720.png' : '/brand/logo-reverse-720.png';
  });
}

export const STICKER_FONT = "'Archivo Variable'";

export const STICKER_W = 1600;
export const STICKER_H = 900;

/**
 * 1600 x 900 PNG to lay over a photo, like a run-tracker overlay: logo, result, three stats
 * and a promo line. Coloured themes sit on a framed court card with see-through corners;
 * the clear themes are type only.
 */
export function drawSticker(d: StickerData): HTMLCanvasElement {
  const th = THEMES[d.theme];
  const c = document.createElement('canvas');
  c.width = STICKER_W;
  c.height = STICKER_H;
  const g = c.getContext('2d')!;
  const font = (weight: number, size: number, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${STICKER_FONT}, system-ui, sans-serif`;
  const left = 110;
  const right = STICKER_W - 110;

  if (th.frame && th.surface) {
    // Frame, court surface, and court lines: the outer lines plus a service line above the footer.
    g.fillStyle = th.frame;
    roundRect(g, 16, 16, STICKER_W - 32, STICKER_H - 32, 56);
    g.fill();
    g.fillStyle = th.surface;
    roundRect(g, 36, 36, STICKER_W - 72, STICKER_H - 72, 40);
    g.fill();
    g.strokeStyle = th.lines!;
    g.lineWidth = 6;
    g.strokeRect(68, 68, STICKER_W - 136, STICKER_H - 136);
    g.beginPath();
    g.moveTo(68, 720);
    g.lineTo(STICKER_W - 68, 720);
    g.stroke();
  }

  const shadow = (on: boolean) => {
    g.shadowColor = on && th.shadow ? th.shadow : 'transparent';
    g.shadowBlur = on && th.shadow ? 14 : 0;
    g.shadowOffsetY = on && th.shadow ? 2 : 0;
  };
  shadow(true);

  // Logo top left, session and date top right.
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if (d.logo) {
    const h = 100;
    g.drawImage(d.logo, left - 8, 92, (d.logo.naturalWidth / d.logo.naturalHeight) * h, h);
  } else {
    g.font = font(800, 64, true);
    g.fillStyle = th.ink;
    g.fillText('Saliiim', left, 172);
    const w = g.measureText('Saliiim').width;
    g.fillStyle = th.accent;
    g.fillText('!', left + w + 2, 172);
  }
  g.textAlign = 'right';
  g.fillStyle = th.ink;
  g.font = font(700, 36);
  g.fillText(fit(g, d.session, 820), right, 140);
  g.font = font(600, 32);
  g.globalAlpha = 0.85;
  g.fillText(d.date, right, 184);
  g.globalAlpha = 1;

  // Place, then the name in the italic court voice.
  g.textAlign = 'left';
  g.fillStyle = th.accent;
  g.font = font(800, 36);
  g.fillText(fit(g, spaced(d.label.toUpperCase()), 1300), left, 292);
  g.fillStyle = th.ink;
  g.font = font(900, 120, true);
  let lines = wrap(g, d.name.toUpperCase(), right - left);
  if (lines.length > 1) {
    g.font = font(900, 92, true);
    lines = wrap(g, d.name.toUpperCase(), right - left).slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, left, 392 + i * 92));
  } else {
    g.fillText(lines[0] ?? '', left, 410);
  }

  // Stats: big numbers over small labels, the last one in the accent colour.
  const top = lines.length > 1 ? 612 : 586;
  const col = (right - left) / d.stats.length;
  d.stats.forEach(([value, label], i) => {
    const x = left + i * col;
    g.fillStyle = i === d.stats.length - 1 ? th.accent : th.ink;
    g.font = font(900, 104, true);
    g.fillText(value, x, top);
    g.fillStyle = th.ink;
    g.globalAlpha = 0.85;
    g.font = font(700, 28);
    g.fillText(fit(g, spaced(label.toUpperCase()), col - 30), x, top + 48);
    g.globalAlpha = 1;
  });

  // Footer: the promo line, and a row of balls on the right.
  shadow(false);
  drawBall(g, left + 14, 788, 16, '#d7f13b');
  shadow(true);
  g.fillStyle = th.ink;
  g.font = font(800, 36);
  g.fillText(fit(g, d.promo, 980), left + 46, 801);
  shadow(false);
  for (let i = 0; i < 5; i++) drawBall(g, right - 14 - i * 46, 788, 16, '#d7f13b');
  return c;
}

const spaced = (text: string) => text.split('').join(String.fromCharCode(8202));

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fdfdf8';
  g.lineWidth = r * 0.14;
  g.beginPath();
  g.arc(x - r * 1.05, y, r * 0.75, -0.9, 0.9);
  g.stroke();
  g.beginPath();
  g.arc(x + r * 1.05, y, r * 0.75, Math.PI - 0.9, Math.PI + 0.9);
  g.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  let t = text;
  while (g.measureText(t).width > max && t.length > 3) t = `${t.slice(0, -2)}…`;
  return t;
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(fit(g, line, max));
  return lines;
}

export function downloadCanvas(c: HTMLCanvasElement, filename: string) {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}
