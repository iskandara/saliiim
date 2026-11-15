export interface StickerData {
  session: string;
  date: string;
  label: string;
  name: string;
  stats: [string, string][];
}

/** 1000 x 880 transparent PNG for Instagram Stories: the logo burst over a court card. */
export function drawSticker(d: StickerData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 880;
  const g = c.getContext('2d')!;
  const green = '#1f5a2e';
  const ink = '#0f2a17';
  const ball = '#d9f03a';

  // Card with a court line.
  g.fillStyle = green;
  roundRect(g, 60, 150, 880, 680, 36);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(60, 230);
  g.lineTo(940, 230);
  g.moveTo(780, 230);
  g.lineTo(780, 830);
  g.stroke();

  // Burst logo.
  g.save();
  g.translate(250, 140);
  g.rotate(-0.08);
  g.fillStyle = ball;
  g.beginPath();
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 120 : 92;
    const a = (Math.PI * i) / spikes;
    g.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.8);
  }
  g.closePath();
  g.fill();
  g.fillStyle = ink;
  g.font = '900 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Saliiim!', 0, 4);
  g.restore();

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  g.font = '700 40px system-ui, sans-serif';
  g.fillText(fit(g, `${d.session} · ${d.date}`, 680), 110, 310);

  g.fillStyle = ink;
  g.font = '800 28px system-ui, sans-serif';
  const w = g.measureText(d.label).width + 28;
  g.fillRect(110, 340, w, 46);
  g.fillStyle = '#ffffff';
  g.fillText(d.label, 124, 373);

  g.font = '900 92px system-ui, sans-serif';
  const lines = wrap(g, d.name, 640).slice(0, 2);
  lines.forEach((line, i) => g.fillText(line, 110, 480 + i * 100));

  d.stats.forEach(([value, label], i) => {
    const x = 110 + i * 215;
    const y = 640;
    g.fillStyle = i === d.stats.length - 1 ? ball : ink;
    g.fillRect(x, y, 195, 130);
    g.fillStyle = i === d.stats.length - 1 ? ink : '#ffffff';
    g.font = '900 56px system-ui, sans-serif';
    g.fillText(value, x + 18, y + 68);
    g.font = '600 22px system-ui, sans-serif';
    g.fillText(label, x + 18, y + 108);
  });
  return c;
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
