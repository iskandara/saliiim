import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePrefs } from '../i18n';
import { backend } from '../state';

/* ---------- icons (decorative; buttons always carry a text label) ---------- */

const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  play: 'M7 4l13 8-13 8z',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  radio: 'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  left: 'M19 12H5M12 19l-7-7 7-7',
  right: 'M5 12h14M12 5l7 7-7 7',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  tv: 'M2 7h20v13H2zM17 2l-5 5-5-5',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

/* ---------- toasts ---------- */

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(text: string, action?: ToastItem['action']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, action }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), action ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div className="toast" key={x.id}>
            <span>{x.text}</span>
            {x.action && (
              <button
                className="toast-action"
                onClick={() => {
                  x.action!.run();
                  setItems((xs) => xs.filter((y) => y.id !== x.id));
                }}
              >
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- layout ---------- */

export function Masthead() {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const dark = theme === 'dark' || (theme === 'device' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <header className="masthead">
      <div className="masthead-top">
        <Link to="/" className="tagline">
          {t('tagline')}
        </Link>
        <Link to="/" className="burst" aria-label="Saliiim home">
          Saliiim!
        </Link>
      </div>
      <div className="net" aria-hidden="true" />
      <div className="prefs">
        <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('theme')} title={t('theme')}>
          <Icon name={dark ? 'sun' : 'moon'} size={16} />
        </button>
        <div className="lang" role="group" aria-label="Language">
          <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
          <button aria-pressed={lang === 'jksl'} onClick={() => setLang('jksl')}>
            JKSL 💅
          </button>
        </div>
      </div>
    </header>
  );
}

export function Page({ children, tabs, wide }: { children: ReactNode; tabs?: ReactNode; wide?: boolean }) {
  const { t } = usePrefs();
  return (
    <div className={`app ${wide ? 'wide' : ''}`}>
      <Masthead />
      {backend.mode === 'local' && <p className="demo">{t('demo_banner')}</p>}
      <main className="content">{children}</main>
      {tabs}
    </div>
  );
}

export function Tabs({ items }: { items: { to: string; label: string; icon: string; active: boolean }[] }) {
  return (
    <nav className="tabs">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className={i.active ? 'active' : ''} aria-current={i.active ? 'page' : undefined}>
          <Icon name={i.icon} size={16} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- controls ---------- */

type BtnProps = {
  children: ReactNode;
  icon?: string;
  kind?: 'primary' | 'dark' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  small?: boolean;
  label?: string;
};

export function Btn({ children, icon, kind = 'ghost', onClick, disabled, type = 'button', small, label }: BtnProps) {
  return (
    <button type={type} className={`btn ${kind} ${small ? 'small' : ''}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {icon && <Icon name={icon} size={small ? 14 : 18} />}
      <span>{children}</span>
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)} type="button">
          {v === value && <Icon name="check" size={14} />}
          {text}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} −`}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} +`}>
        +
      </button>
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on wider screens. Esc and tapping outside close it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && (
        <span className="field-error">
          <Icon name="info" size={14} /> {error}
        </span>
      )}
    </label>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const absUrl = (path: string) => `${window.location.origin}${path}`;

/** WhatsApp, Instagram, Facebook and LINE open links in their own browser with separate storage. */
export function inAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(navigator.userAgent);
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="center">{children}</div>;
}
