import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePrefs } from '../i18n';
import { backend } from '../state';

// Icons are decorative: every button also carries a text label.
// Square caps and a heavy stroke match the 2px borders and the heavy display type.
const paths: Record<string, string> = {
  plus: 'M12 4v16M4 12h16',
  link: 'M10 14l4-4M8.5 11.5L6 14a3.5 3.5 0 0 0 5 5l2.5-2.5M15.5 12.5L18 10a3.5 3.5 0 0 0-5-5l-2.5 2.5',
  play: 'M7 4v16l13-8z',
  skip: 'M5 4v16l10-8zM19 4v16',
  undo: 'M9 15L4 10l5-5M4 10h11a5 5 0 0 1 0 10h-4',
  users: 'M3 21v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 14a4 4 0 0 1 4 4v3M15 4.3a3.5 3.5 0 0 1 0 6.4',
  trophy: 'M8 21h8M12 16v5M7 3h10v6a5 5 0 0 1-10 0zM17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3',
  radio: 'M12 12v.01M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  left: 'M20 12H5M11 18l-6-6 6-6',
  right: 'M4 12h15M13 6l6 6-6 6',
  shuffle: 'M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  moon: 'M20 13.5A8.5 8.5 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  download: 'M4 15v5h16v-5M7 10l5 5 5-5M12 15V3',
  tv: 'M2 7h20v13H2zM16 3l-4 4-4-4',
  out: 'M10 20H4V4h6M16 16l4-4-4-4M20 12H9',
  key: 'M14.5 9.5L21 3M18 6l3 3M8.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11',
  crown: 'M3 19h18M4 16L3 6l5 4 4-6 4 6 5-4-1 10z',
  edit: 'M4 20h16M15 4l5 5-10 10H5v-5z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-5M12 8v.01',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// Toasts

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

// Layout

export type HeaderSize = 'full' | 'compact' | 'none';

/**
 * Full masthead (tagline, net) on Home, Setup and the join page.
 * Compact one-line header during a session, so the scoreboard stays above the fold.
 */
export function Masthead({ size }: { size: 'full' | 'compact' }) {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const dark = theme === 'dark' || (theme === 'device' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const prefs = (
    <div className="prefs">
      <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('theme')} title={t('theme')}>
        <Icon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
      <div className="lang" role="group" aria-label={t('language')}>
        <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
          EN
        </button>
        <button aria-pressed={lang === 'jksl'} onClick={() => setLang('jksl')}>
          JKSL
        </button>
      </div>
    </div>
  );
  if (size === 'compact') {
    return (
      <header className="masthead compact">
        <Link to="/" className="burst small" aria-label={t('home_link')}>
          Saliiim!
        </Link>
        {prefs}
      </header>
    );
  }
  return (
    <header className="masthead">
      <div className="masthead-top">
        <p className="tagline">{t('tagline')}</p>
        <Link to="/" className="burst" aria-label={t('home_link')}>
          Saliiim!
        </Link>
      </div>
      <div className="net" aria-hidden="true" />
      <div className="prefs-row">{prefs}</div>
    </header>
  );
}

export function Page({ children, tabs, wide, header = 'compact' }: { children: ReactNode; tabs?: ReactNode; wide?: boolean; header?: HeaderSize }) {
  const { t } = usePrefs();
  return (
    <div className={`app ${wide ? 'wide' : ''} ${tabs ? 'has-tabs' : ''}`}>
      <a className="skip-link" href="#main">
        {t('skip_to_content')}
      </a>
      {header !== 'none' && <Masthead size={header} />}
      {backend.mode === 'local' && header !== 'none' && <p className="demo">{t('demo_banner')}</p>}
      <main className="content" id="main" tabIndex={-1}>
        {children}
      </main>
      {tabs}
    </div>
  );
}

export function Tabs({ items }: { items: { to: string; label: string; icon: string; active: boolean }[] }) {
  return (
    <nav className="tabs">
      {items.map((i) => (
        <Link key={i.to} to={i.to} viewTransition className={i.active ? 'active' : ''} aria-current={i.active ? 'page' : undefined}>
          <Icon name={i.icon} size={16} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

// Controls

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
      {icon && <Icon name={icon} size={small ? 16 : 18} />}
      <span>{children}</span>
    </button>
  );
}

/** Radio group: only the selected option is in the Tab order; arrow keys move and select. */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.findIndex(([v]) => v === value));
  const onKey = (e: ReactKeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const from = refs.current.findIndex((el) => el === document.activeElement);
    const next = ((from >= 0 ? from : current) + step + options.length) % options.length;
    onChange(options[next]![0]);
    refs.current[next]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map(([v, text], i) => (
        <button
          key={String(v)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={v === value}
          tabIndex={i === current ? 0 : -1}
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
          type="button"
        >
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

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centred dialog on wider screens. Esc and tapping outside close it.
 * Focus stays inside while open and returns to the control that opened it.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      const back = opener.current;
      if (back && document.contains(back)) back.focus();
    };
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
