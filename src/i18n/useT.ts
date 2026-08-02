import { useLanguage } from '../app/providers/LanguageProvider';
import type { CatalogKey } from './catalog';
import type { TranslateParams } from './translate';

/** Shape of the `t` function — for typing props that pass it down. */
export type TFunction = (key: CatalogKey, params?: TranslateParams) => string;

/**
 * Convenience hook: `const t = useT();` → `t('settings.language.label')`.
 * Components needing the locale itself (formatting, prompts) should use
 * `useLanguage()` directly.
 */
export function useT(): TFunction {
  return useLanguage().t;
}
