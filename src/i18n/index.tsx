import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, jksl, type Key } from './strings';

export type Lang = 'en' | 'jksl';
export type Theme = 'light' | 'dark' | 'device';

const read = (k: string, fallback: string) => {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* preferences are best effort */
  }
};

type T = (key: Key, vars?: Record<string, string | number>) => string;

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: T;
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (read('saliiim:lang', 'en') === 'jksl' ? 'jksl' : 'en'));
  const [theme, setThemeState] = useState<Theme>(() => read('saliiim:theme', 'device') as Theme);

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'id';
  }, [lang]);
  useEffect(() => {
    if (theme === 'device') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const t = useCallback<T>(
    (key, vars) => {
      let s: string = (lang === 'jksl' ? jksl : en)[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo<Prefs>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        write('saliiim:lang', l);
      },
      theme,
      setTheme: (th) => {
        setThemeState(th);
        write('saliiim:theme', th);
      },
      t,
    }),
    [lang, theme, t],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error('PrefsProvider missing');
  return v;
}

export const useT = () => usePrefs().t;
