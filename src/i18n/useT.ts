import { useLanguage } from '../app/providers/LanguageProvider';

/**
 * Convenience hook: `const t = useT();` → `t('settings.language.label')`.
 * Components needing the locale itself (formatting, prompts) should use
 * `useLanguage()` directly.
 */
export function useT() {
  return useLanguage().t;
}
