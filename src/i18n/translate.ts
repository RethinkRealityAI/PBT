import { en } from './en';
import type { Catalog, CatalogKey } from './catalog';
import { DEFAULT_LOCALE, type Locale } from './locales';

/**
 * Framework-free translation core. React components go through `useT()`;
 * non-React consumers (prompt builders, services, pure helpers) call
 * `translate()` directly with an explicit locale.
 *
 * Non-English catalogs are registered lazily: `loadCatalog()` dynamic-imports
 * them so the default (English) bundle never pays for other languages. Until
 * a catalog is registered, `translate` falls back to English — the
 * LanguageProvider awaits the load before flipping the locale, so users
 * never actually see the fallback except in exotic failure cases.
 */

const registry: Partial<Record<Locale, Catalog>> = { en };

export function registerCatalog(locale: Locale, catalog: Catalog): void {
  registry[locale] = catalog;
}

export function isCatalogLoaded(locale: Locale): boolean {
  return registry[locale] != null;
}

export async function loadCatalog(locale: Locale): Promise<void> {
  if (registry[locale]) return;
  switch (locale) {
    case 'fr': {
      const mod = await import('./fr');
      registerCatalog('fr', mod.fr);
      return;
    }
    default:
      return;
  }
}

export type TranslateParams = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: CatalogKey,
  params?: TranslateParams,
): string {
  const catalog = registry[locale] ?? registry[DEFAULT_LOCALE] ?? en;
  let text = catalog[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
