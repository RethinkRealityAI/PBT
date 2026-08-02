import { Glass } from '../design-system/Glass';
import { useLanguage } from '../app/providers/LanguageProvider';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT } from '../i18n/locales';

/**
 * Quick EN/FR pill — lives beside the theme toggle in the TopBar (mobile)
 * and Sidebar (desktop). Cycles through LOCALES so a third language slots in
 * with no UI change; the full-name picker lives in Settings.
 */
export function LocaleToggle() {
  const { locale, setLocale, t } = useLanguage();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

  return (
    <Glass
      radius={9999}
      padding={0}
      tint={0.3}
      shine={false}
      onClick={() => setLocale(next)}
      ariaLabel={`${t('chrome.languageToggle.aria')} — ${LOCALE_LABELS[next]}`}
      className="flex h-9 min-w-9 items-center justify-center px-1"
    >
      <span
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--pbt-text)',
        }}
      >
        {LOCALE_SHORT[locale]}
      </span>
    </Glass>
  );
}
