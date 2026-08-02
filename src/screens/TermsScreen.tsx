import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { writeStorage, STORAGE_KEYS } from '../lib/storage';
import { RADII } from '../design-system/tokens';
import { useT } from '../i18n/useT';
import type { CatalogKey } from '../i18n/catalog';

const TERMS_VERSION = 1;

/**
 * Section copy lives in the `terms` catalog namespace (legal-adjacent — see
 * the note in `src/i18n/en/terms.ts`). `id` is the stable React key.
 */
const SECTIONS: { id: string; title: CatalogKey; body: CatalogKey }[] = [
  { id: 'what', title: 'terms.section.what.title', body: 'terms.section.what.body' },
  { id: 'act', title: 'terms.section.act.title', body: 'terms.section.act.body' },
  { id: 'ai', title: 'terms.section.ai.title', body: 'terms.section.ai.body' },
  {
    id: 'knowledge',
    title: 'terms.section.knowledge.title',
    body: 'terms.section.knowledge.body',
  },
  {
    id: 'anonymous',
    title: 'terms.section.anonymous.title',
    body: 'terms.section.anonymous.body',
  },
  {
    id: 'privacy',
    title: 'terms.section.privacy.title',
    body: 'terms.section.privacy.body',
  },
];

export function TermsScreen() {
  const { replace } = useNavigation();
  const t = useT();
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());
    localStorage.setItem('pbt:terms_version', String(TERMS_VERSION));
    replace('quiz');
  };

  return (
    <>
      <TopBar title={t('terms.topbar.title')} />
      <Page>
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 10,
            fontWeight: 700,
          }}
        >
          {t('terms.eyebrow')}
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: '0 0 22px',
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.08,
            color: 'var(--pbt-text)',
            whiteSpace: 'pre-line',
          }}
        >
          {t('terms.headline')}
        </h1>

        {/* Content sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {SECTIONS.map((s) => (
            <Glass key={s.id} radius={RADII.lg} padding={18}>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  fontWeight: 700,
                  marginBottom: 7,
                }}
              >
                {t(s.title)}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--pbt-text)',
                  opacity: 0.82,
                }}
              >
                {t(s.body)}
              </div>
            </Glass>
          ))}
        </div>

        {/* Agreement + CTA */}
        <Glass radius={RADII.lg} padding={20} style={{ marginBottom: 32 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              fontSize: 14,
              cursor: 'pointer',
              marginBottom: 18,
              color: 'var(--pbt-text)',
              lineHeight: 1.5,
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                marginTop: 3,
                accentColor: 'oklch(0.62 0.22 22)',
                width: 16,
                height: 16,
                flexShrink: 0,
                cursor: 'pointer',
              }}
            />
            <span>{t('terms.agree.checkbox')}</span>
          </label>
          <PillButton
            fullWidth
            disabled={!agreed}
            icon={<Icon.arrow />}
            onClick={handleAccept}
          >
            {t('terms.agree.cta')}
          </PillButton>
        </Glass>
      </Page>
    </>
  );
}
