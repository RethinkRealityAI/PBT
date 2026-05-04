import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';

export interface TermsModalProps {
  open: boolean;
  onAccept: () => void;
}

const TERMS_VERSION = 1;

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What this is',
    body: 'PBT (Pushback Training) is a training simulator. The conversations here are roleplay — they do not constitute veterinary advice for any specific animal. Always consult a licensed veterinary professional for clinical decisions.',
  },
  {
    title: 'How the AI works',
    body: 'The customer roleplay and scoring are powered by a large language model (Gemini). The AI may produce inaccurate, biased, or out-of-date statements. Treat its output as a training stimulus, not as fact.',
  },
  {
    title: 'Knowledge base & data use',
    body: 'PBT references published guidelines (WSAVA, NRC) and Royal Canin training material. Anonymized session transcripts may be used to refine the rubric and the knowledge base. You can opt out from Settings → Privacy at any time.',
  },
  {
    title: 'Anonymous by default',
    body: "You can use PBT without an account. Your profile, sessions, and pet records live in your browser's local storage on this device. Creating an account is optional and uploads your existing local data to a private, encrypted cloud profile that only you can access.",
  },
  {
    title: 'No medical advice',
    body: 'Clinical references (BCS, MCS, calorie targets) are educational. Do not use PBT to diagnose, treat, or modify a real animal\'s diet without the involvement of a licensed veterinarian.',
  },
  {
    title: 'Privacy',
    body: 'No PII is collected unless you explicitly create an account. We do not share your data with third parties. We do not run advertising. Full privacy policy: ask at the company contact.',
  },
];

export function TermsModal({ open, onAccept }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="pbt-terms-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(12, 4, 6, 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px',
      }}
    >
      <Glass
        radius={28}
        padding={0}
        tint={0.88}
        blur={40}
        glow="oklch(0.62 0.22 22)"
        style={{
          maxWidth: 440,
          width: '100%',
          maxHeight: 'min(90dvh, 680px)',
          overflow: 'hidden',
        }}
      >
        {/* Inner flex column — Glass wraps in a z-1 div so we must own the layout here */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            maxHeight: 'min(90dvh, 680px)',
          }}
        >
          {/* Header — fixed height, never scrolls */}
          <div style={{ padding: '28px 24px 16px', flexShrink: 0 }}>
            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                marginBottom: 10,
                fontWeight: 700,
              }}
            >
              Welcome to PBT
            </div>
            <h2
              id="pbt-terms-title"
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: 'var(--pbt-text)',
              }}
            >
              A few things before
              <br />
              we start.
            </h2>
          </div>

          {/* Divider */}
          <div
            style={{
              height: '0.5px',
              background: 'rgba(255,255,255,0.15)',
              flexShrink: 0,
              marginLeft: 24,
              marginRight: 24,
            }}
          />

          {/* Scrollable content — minHeight:0 is critical for flex scroll to work */}
          <div
            className="pbt-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '16px 24px 8px',
            }}
          >
            {SECTIONS.map((s) => (
              <div key={s.title} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13.5,
                    marginBottom: 5,
                    color: 'var(--pbt-text)',
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: 'var(--pbt-text)',
                    opacity: 0.75,
                  }}
                >
                  {s.body}
                </div>
              </div>
            ))}
          </div>

          {/* Footer — always visible at bottom */}
          <div
            style={{
              flexShrink: 0,
              padding: '16px 24px 24px',
              borderTop: '0.5px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: 16,
                color: 'var(--pbt-text)',
                lineHeight: 1.45,
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{
                  marginTop: 2,
                  accentColor: 'oklch(0.62 0.22 22)',
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              />
              <span>
                I understand PBT is a training tool, not veterinary advice, and I
                agree to the privacy approach above.
              </span>
            </label>
            <PillButton
              fullWidth
              disabled={!agreed}
              icon={<Icon.arrow />}
              onClick={() => {
                localStorage.setItem(
                  'pbt:terms_accepted_at',
                  JSON.stringify(new Date().toISOString()),
                );
                localStorage.setItem('pbt:terms_version', String(TERMS_VERSION));
                onAccept();
              }}
            >
              I agree — let&apos;s go
            </PillButton>
          </div>
        </div>
      </Glass>
    </div>
  );
}
