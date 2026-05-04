import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { writeStorage, STORAGE_KEYS } from '../lib/storage';
import { RADII } from '../design-system/tokens';

const TERMS_VERSION = 1;

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What this is',
    body: 'PBT (Pushback Training) is a simulation tool designed to help veterinary teams practise handling common client objections — pricing, breed diets, raw food, and more. Scenarios here are roleplay exercises, not real client interactions. They are not a substitute for professional judgment.',
  },
  {
    title: 'The ACT framework',
    body: 'Sessions are scored against the ACT model: Acknowledge, Clarify, Take Action. The AI plays the customer; you practise your response. Scores reflect communication quality within the simulation, not clinical competence.',
  },
  {
    title: 'How the AI works',
    body: "Customer roleplay and scoring are powered by a large language model. The AI may produce imperfect or unexpected responses — treat its output as a training stimulus, not authoritative fact. (Responses are used to continuously improve the simulation anonymously.)",
  },
  {
    title: 'Knowledge base',
    body: 'PBT references published guidelines (WSAVA, NRC) and Royal Canin training material as context for realistic scenarios. Always verify clinical decisions with your own expertise and up-to-date sources.',
  },
  {
    title: 'Anonymous by default',
    body: "You can use PBT without an account. Your profile and session history live in your browser's local storage on this device only. Creating an account is optional — it backs up your data to a private, encrypted cloud profile.",
  },
  {
    title: 'Privacy',
    body: 'No personally identifiable information is collected unless you explicitly create an account. Session data is not shared with third parties and is not used for advertising. For questions, contact the Royal Canin training team.',
  },
];

export function TermsScreen() {
  const { replace } = useNavigation();
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());
    localStorage.setItem('pbt:terms_version', String(TERMS_VERSION));
    replace('quiz');
  };

  return (
    <>
      <TopBar title="Before we begin" />
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
          PBT · Pushback Training
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
          {`A few things\nbefore we start.`}
        </h1>

        {/* Content sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {SECTIONS.map((s) => (
            <Glass key={s.title} radius={RADII.lg} padding={18}>
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
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--pbt-text)',
                  opacity: 0.82,
                }}
              >
                {s.body}
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
            <span>
              I understand PBT is a training simulator, not a substitute for professional
              judgment, and I agree to the privacy approach above.
            </span>
          </label>
          <PillButton
            fullWidth
            disabled={!agreed}
            icon={<Icon.arrow />}
            onClick={handleAccept}
          >
            I agree — let&apos;s go
          </PillButton>
        </Glass>
      </Page>
    </>
  );
}
