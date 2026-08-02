import { LOCALE_BCP47, type Locale } from './locales';

/**
 * Locale-aware formatting helpers. Always route dates/times/percentages
 * through these instead of bare `toLocaleString()` so the APP locale (not
 * the browser locale) drives the output.
 */

export function formatDateTime(date: Date | string | number, locale: Locale): string {
  return new Date(date).toLocaleString(LOCALE_BCP47[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatTime(date: Date | string | number, locale: Locale): string {
  return new Date(date).toLocaleTimeString(LOCALE_BCP47[locale], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * French typography puts a narrow no-break space (U+202F) before the percent
 * sign; English does not.
 */
export function formatPercent(value: number, locale: Locale): string {
  return locale === 'fr' ? `${value} %` : `${value}%`;
}
