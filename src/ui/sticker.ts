export interface StickerData {
  session: string;
  date: string;
  label: string;
  name: string;
  stats: [string, string][];
  /** The cream header logo; the typed wordmark is the fallback if it failed to load. */
  logo?: HTMLImageElement | null;
}

export function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/brand/logo-reverse-720.png';
  });
}

export const STICKER_FONT = "'Archivo Variable'";

/** 1000 x 880 transparent PNG for Instagram Stories: a green-framed blue court with the result. */
export function drawSticker(d: StickerData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 880;
  const g = c.getContext('2d')!;
  const frame = '#0b5534';
  const court = '#4357cc';
  const line = 'rgba(244,245,249,0.92)';
  const ink = '#11241a';
  const ball = '#d7f13b';
  const font = (weight: number, size: number, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${STICKER_FONT}, system-ui, sans-serif`;

  // Green frame, blue court, white court lines.
  g.fillStyle = frame;
  roundRect(g, 40, 40, 920, 800, 48);
  g.fill();
  g.fillStyle = court;
  roundRect(g, 64, 120, 872, 696, 28);
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 7;
  g.strokeRect(92, 148, 816, 640);
  g.beginPath();
  g.moveTo(200, 148);
  g.lineTo(200, 788);
  g.moveTo(800, 148);
  g.lineTo(800, 788);
  g.stroke();

  // Logo in the frame, like the app header.
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if (d.logo) {
    const h = 66;
    g.drawImage(d.logo, 84, 46, (d.logo.naturalWidth / d.logo.naturalHeight) * h, h);
  } else {
    g.font = font(800, 48);
    g.fillStyle = '#ffffff';
    g.fillText('Saliiim', 92, 100);
    const w = g.measureText('Saliiim').width;
    g.fillStyle = ball;
    g.fillText('!', 92 + w + 2, 100);
  }

  // Result, centred on the court.
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = font(800, 26);
  g.fillText(fit(g, d.label.toUpperCase().split('').join(String.fromCharCode(8202)), 560), 500, 260);
  g.font = font(600, 30);
  g.fillText(fit(g, `${d.session} · ${d.date}`, 560), 500, 306);
  g.font = font(900, 96, true);
  const lines = wrap(g, d.name.toUpperCase(), 560).slice(0, 2);
  lines.forEach((l, i) => g.fillText(l, 500, 420 + i * 100));

  // Stat chips.
  const top = lines.length > 1 ? 560 : 500;
  d.stats.forEach(([value, label], i) => {
    const x = 220 + i * 190;
    const hl = i === d.stats.length - 1;
    g.fillStyle = hl ? ball : '#f4f5f9';
    roundRect(g, x, top, 170, 120, 22);
    g.fill();
    g.fillStyle = ink;
    g.font = font(900, 52, true);
    g.fillText(value, x + 85, top + 64);
    g.font = font(700, 20);
    g.fillText(fit(g, label, 150), x + 85, top + 98);
  });

  // A row of balls along the baseline.
  for (let i = 0; i < 9; i++) drawBall(g, 250 + i * 62, 752, 20, ball);
  return c;
}

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
