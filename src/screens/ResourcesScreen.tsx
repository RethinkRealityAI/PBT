import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useT } from '../i18n/useT';
import type { CatalogKey } from '../i18n/catalog';

/**
 * Accordion structure only — every string lives in the `resources` catalog
 * namespace (`src/i18n/<locale>/resources.ts`). Keys are spelled out rather
 * than templated so `tsc` checks each one against `CatalogKey`.
 */
interface Section {
  key: string;
  eyebrow: CatalogKey;
  title: CatalogKey;
  summary: CatalogKey;
  topics: { title: CatalogKey; body: CatalogKey }[];
}

const SECTIONS: Section[] = [
  {
    key: 'nutrition',
    eyebrow: 'resources.nutrition.eyebrow',
    title: 'resources.nutrition.title',
    summary: 'resources.nutrition.summary',
    topics: [
      {
        title: 'resources.nutrition.topic1.title',
        body: 'resources.nutrition.topic1.body',
      },
      {
        title: 'resources.nutrition.topic2.title',
        body: 'resources.nutrition.topic2.body',
      },
      {
        title: 'resources.nutrition.topic3.title',
        body: 'resources.nutrition.topic3.body',
      },
    ],
  },
  {
    key: 'bcs',
    eyebrow: 'resources.bcs.eyebrow',
    title: 'resources.bcs.title',
    summary: 'resources.bcs.summary',
    topics: [
      { title: 'resources.bcs.topic1.title', body: 'resources.bcs.topic1.body' },
      { title: 'resources.bcs.topic2.title', body: 'resources.bcs.topic2.body' },
    ],
  },
  {
    key: 'mcs',
    eyebrow: 'resources.mcs.eyebrow',
    title: 'resources.mcs.title',
    summary: 'resources.mcs.summary',
    topics: [
      { title: 'resources.mcs.topic1.title', body: 'resources.mcs.topic1.body' },
      { title: 'resources.mcs.topic2.title', body: 'resources.mcs.topic2.body' },
    ],
  },
  {
    key: 'calories',
    eyebrow: 'resources.calories.eyebrow',
    title: 'resources.calories.title',
    summary: 'resources.calories.summary',
    topics: [
      {
        title: 'resources.calories.topic1.title',
        body: 'resources.calories.topic1.body',
      },
      {
        title: 'resources.calories.topic2.title',
        body: 'resources.calories.topic2.body',
      },
    ],
  },
];

const ACCENT = 'oklch(0.62 0.22 22)';

export function ResourcesScreen() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <TopBar showBack title={t('resources.title')} />
      <Page withTabBar>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            margin: '0 0 18px',
            lineHeight: 1.05,
            color: 'var(--pbt-text)',
            whiteSpace: 'pre-line',
          }}
        >
          {t('resources.headline')}
        </h1>

        {SECTIONS.map((s) => {
          const isOpen = open === s.key;
          return (
            <Glass
              key={s.key}
              radius={22}
              padding={18}
              style={{ marginBottom: 12 }}
              onClick={() => setOpen(isOpen ? null : s.key)}
              ariaLabel={t(s.title)}
            >
              <div className="flex items-start justify-between gap-3">
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: ACCENT,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    {t(s.eyebrow)}
                  </div>
                  <h2
                    style={{
                      margin: '0 0 6px',
                      fontSize: 20,
                      fontWeight: 400,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.15,
                      color: 'var(--pbt-text)',
                    }}
                  >
                    {t(s.title)}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: 'var(--pbt-text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {t(s.summary)}
                  </p>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: isOpen
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                      : 'rgba(60,20,15,0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    color: isOpen ? '#fff' : ACCENT,
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                >
                  <Icon.chevronDown />
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 16, borderTop: '0.5px solid rgba(60,20,15,0.08)', paddingTop: 14 }}>
                  {s.topics.map((topic) => (
                    <div key={topic.title} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13.5,
                          marginBottom: 3,
                          color: 'var(--pbt-text)',
                        }}
                      >
                        {t(topic.title)}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--pbt-text-muted)',
                          lineHeight: 1.5,
                        }}
                      >
                        {t(topic.body)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Glass>
          );
        })}

        <Glass radius={20} padding={16}>
          <div className="flex items-center gap-2">
            <Icon.book />
            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
              }}
            >
              {t('resources.sources.label')}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--pbt-text-muted)',
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {t('resources.sources.body')}
          </div>
        </Glass>
      </Page>
    </>
  );
}
