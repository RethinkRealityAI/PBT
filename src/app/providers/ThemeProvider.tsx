import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Override initial theme (mainly for tests). */
  initialTheme?: ThemeMode;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => initialTheme ?? readStorage(STORAGE_KEYS.theme),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        'content',
        resolvedTheme === 'dark' ? '#0e0306' : '#ffffff',
      );
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    writeStorage(STORAGE_KEYS.theme, next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const resolved: ResolvedTheme =
        prev === 'system' ? getSystemTheme() : prev;
      const next: ThemeMode = resolved === 'dark' ? 'light' : 'dark';
      writeStorage(STORAGE_KEYS.theme, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Default fallback so design-system primitives don't crash
    // when rendered outside a provider (e.g. snapshot tests).
    return {
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
