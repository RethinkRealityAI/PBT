import type { Locale } from './locales';

/**
 * Locale overlays for AUTHORED DATA — quiz questions, ECHO driver content,
 * scenario/pushback display fields, clinical reference prose. Unlike the flat
 * UI catalog (translate.ts), these are structured per-domain objects.
 *
 * Key-indirection design (see the SOW plan): the canonical data modules in
 * `src/data/` ARE the English text, so English never registers an overlay and
 * can never drift. A locale's overlay is typed at its definition site
 * (`Record<CanonicalId, DisplayFields>`), making a missing id a compile
 * error. Display-only helpers in `src/i18n/dataL10n/` merge the overlay over
 * the canonical objects; objects that reach prompts or persistence are never
 * mutated, and DB CHECK-constrained values (DriverKey, pushback ids) stay
 * stable keys.
 *
 * Overlays ride the same lazy `import('./fr')` as the UI catalog
 * (loadCatalog registers `frData`), so French data text never weighs down
 * the default bundle.
 */
const registry = new Map<Locale, Record<string, unknown>>();

export function registerDataCatalog(
  locale: Locale,
  data: Record<string, unknown>,
): void {
  registry.set(locale, { ...registry.get(locale), ...data });
}

/**
 * The overlay a dataL10n helper reads for its domain, or undefined when the
 * locale has none (English, or a catalog that hasn't loaded yet — helpers
 * must fall back to the canonical data in both cases).
 */
export function getDataOverlay<T>(locale: Locale, domain: string): T | undefined {
  return registry.get(locale)?.[domain] as T | undefined;
}
