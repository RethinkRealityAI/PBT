import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';

interface Section {
  key: string;
  eyebrow: string;
  title: string;
  summary: string;
  topics: { title: string; body: string }[];
}

const SECTIONS: Section[] = [
  {
    key: 'nutrition',
    eyebrow: 'Nutrition assessment',
    title: 'A six-question screening that fits any visit.',
    summary:
      'WSAVA Global Nutrition Toolkit screening covers diet history, body condition, muscle condition, life-stage needs, environment, and product format.',
    topics: [
      {
        title: 'The 5-second screen',
        body: 'BCS + MCS + diet history. Anything outside normal triggers a fuller evaluation.',
      },
      {
        title: 'Why anchor on BCS',
        body: 'Body condition is more reliable than weight alone — same dog, different builds, very different ideal weights.',
      },
      {
        title: 'Diet history red flags',
        body: 'Multiple food brands rotated weekly, raw without supplementation, or grain-free for >12 months without GI history.',
      },
    ],
  },
  {
    key: 'bcs',
    eyebrow: 'Body condition (BCS)',
    title: 'Score 1–9: ribs, waist, abdominal tuck.',
    summary:
      'A visual + palpation system. 4–5 is ideal for most adult dogs. Each point above 5 ≈ 10–15% above ideal weight.',
    topics: [
      {
        title: 'How to palpate',
        body: 'Light pressure over ribs. Easily felt, slight fat covering = ideal. Hard to feel = overweight.',
      },
      {
        title: 'Visual cues',
        body: 'Tucked abdomen + visible waist from above = healthy. No tuck, no waist = elevated BCS.',
      },
    ],
  },
  {
    key: 'mcs',
    eyebrow: 'Muscle condition (MCS)',
    title: 'Independent of BCS — scored over four bony landmarks.',
    summary:
      'Spine, scapulae, skull, ilial wings. Categories: normal, mild, moderate, severe. Common in seniors and chronic disease.',
    topics: [
      {
        title: 'Why MCS matters separately',
        body: 'A dog can be both overweight (BCS 7+) and muscle-wasted (MCS moderate). Calories alone won\'t fix muscle loss.',
      },
      {
        title: 'When to flag',
        body: 'Any non-normal MCS warrants chronic-disease screen and protein-focused nutrition plan.',
      },
    ],
  },
  {
    key: 'calories',
    eyebrow: 'Calorie targets',
    title: '130 × kg^0.75 active · 95 × kg^0.75 inactive.',
    summary:
      'Daily maintenance energy requirement (DMER) per 2006 NRC. For weight loss, target 80% of DMER for ideal — not current — weight.',
    topics: [
      {
        title: 'Common feeding errors',
        body: 'Treats average 10–15% of daily intake — frequently uncounted. Free-feeding amplifies BCS drift.',
      },
      {
        title: 'Practical math',
        body: 'A 30 kg lab at active level = 130 × 30^0.75 ≈ 1665 kcal/day. Compare against current bag\'s feeding guide.',
      },
    ],
  },
];

const ACCENT = 'oklch(0.62 0.22 22)';

export function ResourcesScreen() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <TopBar showBack title="Library" />
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
          {`Clinical reference,\nat the speed of conversation.`}
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
              ariaLabel={s.title}
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
                    {s.eyebrow}
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
                    {s.title}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: 'var(--pbt-text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {s.summary}
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
                  {s.topics.map((t) => (
                    <div key={t.title} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13.5,
                          marginBottom: 3,
                          color: 'var(--pbt-text)',
                        }}
                      >
                        {t.title}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--pbt-text-muted)',
                          lineHeight: 1.5,
                        }}
                      >
                        {t.body}
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
              Sources
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
            WSAVA Global Nutrition Toolkit · Body & Muscle Scoring Charts
            (2020) · Tufts University MCS chart (2013) · 2006 NRC DMER
          </div>
        </Glass>
      </Page>
    </>
  );
}
