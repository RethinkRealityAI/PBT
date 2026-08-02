/**
 * Locale registry — the single place a new language gets declared.
 *
 * Adding a locale: add its key here, create `src/i18n/<locale>/` catalogs
 * (the `Catalog` type forces full key coverage), add a dynamic-import arm in
 * `translate.ts#loadCatalog`, and run the translator agent
 * (`.claude/agents/translator.md`) over the new catalog files. Nothing else
 * in the app hardcodes the locale list.
 */
export type Locale = 'en' | 'fr';

export const LOCALES: Locale[] = ['en', 'fr'];

export const DEFAULT_LOCALE: Locale = 'en';

/** Full display name, in its own language (used in Settings). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

/** Short badge used by the quick EN/FR toggle pill. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
};

/**
 * BCP-47 tag per locale — drives `<html lang>`, Intl formatting, and the
 * voice session's speech config. French is Canadian French by product
 * decision (Royal Canin CA market).
 */
export const LOCALE_BCP47: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-CA',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as string[]).includes(v);
}
