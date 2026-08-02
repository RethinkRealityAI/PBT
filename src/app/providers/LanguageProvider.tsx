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
import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  isLocale,
  type Locale,
} from '../../i18n/locales';
import {
  isCatalogLoaded,
  loadCatalog,
  translate,
  type TranslateParams,
} from '../../i18n/translate';
import type { CatalogKey } from '../../i18n/catalog';

/**
 * App-wide language state, modeled on ThemeProvider: initialised from
 * `pbt:locale`, written through on change, and reflected onto
 * `<html lang>` so assistive tech + hyphenation follow the app locale.
 *
 * Non-English catalogs load lazily; `setLocale` awaits the catalog BEFORE
 * flipping state so the UI never renders a half-translated frame. On a cold
 * start in a non-English locale, the catalog loads in an effect and bumps
 * `catalogVersion` to re-render once it lands (English fallback until then).
 */

interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: CatalogKey, params?: TranslateParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export interface LanguageProviderProps {
  children: ReactNode;
  /** Override initial locale (mainly for tests). */
  initialLocale?: Locale;
}

export function LanguageProvider({ children, initialLocale }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = initialLocale ?? readStorage(STORAGE_KEYS.locale);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  });
  const [, setCatalogVersion] = useState(0);

  // Cold start in a lazy-catalog locale: load it, then force one re-render.
  useEffect(() => {
    if (isCatalogLoaded(locale)) return;
    let cancelled = false;
    void loadCatalog(locale).then(() => {
      if (!cancelled) setCatalogVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = LOCALE_BCP47[locale];
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    writeStorage(STORAGE_KEYS.locale, next);
    void loadCatalog(next).finally(() => {
      setLocaleState(next);
    });
  }, []);

  const t = useCallback(
    (key: CatalogKey, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback so primitives render outside the provider (tests).
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    };
  }
  return ctx;
}
