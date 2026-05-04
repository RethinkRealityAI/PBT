import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { RADII } from '../design-system/tokens';
import { ACT_STEPS } from '../data/knowledge/actGuide';
import type { DriverKey } from '../design-system/tokens';

// ACT-specific colors (not driver colors)
const ACT_COLORS = {
  acknowledge: {
    primary: 'oklch(0.65 0.18 265)',   // lavender/blue
    soft: 'oklch(0.94 0.06 265)',
    glow: 'oklch(0.65 0.18 265)',
  },
  clarify: {
    primary: 'oklch(0.75 0.18 80)',    // amber/yellow
    soft: 'oklch(0.96 0.08 80)',
    glow: 'oklch(0.75 0.18 80)',
  },
  takeAction: {
    primary: 'oklch(0.65 0.18 160)',   // teal/green
    soft: 'oklch(0.94 0.06 160)',
    glow: 'oklch(0.65 0.18 160)',
  },
} as const;

const STEP_LABELS = {
  acknowledge: 'ACKNOWLEDGE',
  clarify: 'CLARIFY',
  takeAction: 'TRANSFORM',
} as const;

const STEP_DESCRIPTIONS = {
  acknowledge: "Don't apologise — show empathy, not weakness. Validate the feeling before anything else.",
  clarify: "Ask one open question at a time. Let them talk. Listen for the real concern beneath the objection.",
  takeAction: "Redirect to value. Lead with the outcome, anchor it to a specific product benefit, and set a defined next step.",
} as const;

const STEP_PHRASES = {
  acknowledge: '"I hear you — Bella clearly means the world to you."',
  clarify: '"Walk me through her day — how much exercise does she get?"',
  takeAction: '"Let\'s do a 4-week trial. 97% of dogs lost weight in 12 weeks — I\'ll check in at week two."',
} as const;

const DRIVER_ACT_TIPS: Record<DriverKey, string> = {
  Activator:
    'Your energy is your superpower in ACT. Lead with a confident, direct acknowledgement — clients feel your conviction. In Clarify, ask bold questions that get to the real issue fast. In Transform, paint a vivid picture of success to inspire action.',
  Energizer:
    'Your natural enthusiasm makes Acknowledge feel warm and genuine — clients open up to you. Use Clarify to deepen that connection with curious, open questions. In Transform, bring your storytelling flair: share a relatable example that makes the value proposition land emotionally.',
  Analyzer:
    'Precision is your edge in ACT. Your Acknowledge should be measured and specific — mirror their exact words back. Clarify with data-minded questions that uncover the root concern. In Transform, lead with evidence: facts, case studies, and clear ROI make your value proposition irresistible.',
  Harmonizer:
    'Empathy is baked into your Acknowledge — clients feel genuinely heard. Use Clarify gently, focusing on what matters most to the relationship. In Transform, frame value around partnership and long-term outcomes; Harmonizers close with care, not pressure.',
};

// SVG animated circle diagram
function ActCircleGraphic() {
  const [t, setT] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      setT((ts - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const pulse = (offset: number) => 0.9 + 0.1 * Math.sin(t * 0.8 + offset);

  return (
    <svg
      viewBox="0 0 320 130"
      width="100%"
      style={{ maxWidth: 380, display: 'block', margin: '0 auto' }}
      aria-hidden
    >
      <defs>
        <filter id="act-glow-a" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="act-glow-b" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="act-glow-c" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Circle A — Acknowledge (left) */}
      <circle
        cx="80" cy="65" r={42 * pulse(0)}
        fill="oklch(0.65 0.18 265 / 0.12)"
        stroke="oklch(0.65 0.18 265)"
        strokeWidth="1.5"
        filter="url(#act-glow-a)"
      />
      {/* Circle B — Clarify (center) */}
      <circle
        cx="160" cy="65" r={42 * pulse(2.1)}
        fill="oklch(0.75 0.18 80 / 0.12)"
        stroke="oklch(0.75 0.18 80)"
        strokeWidth="1.5"
        filter="url(#act-glow-b)"
      />
      {/* Circle C — Transform (right) */}
      <circle
        cx="240" cy="65" r={42 * pulse(4.2)}
        fill="oklch(0.65 0.18 160 / 0.12)"
        stroke="oklch(0.65 0.18 160)"
        strokeWidth="1.5"
        filter="url(#act-glow-c)"
      />

      {/* Arrow A→B */}
      <path
        d={`M ${115 + 4 * Math.sin(t * 0.6)} 58 Q 130 52 ${145 - 4 * Math.sin(t * 0.6)} 58`}
        fill="none"
        stroke="oklch(0.65 0.18 265 / 0.7)"
        strokeWidth="1.5"
        markerEnd="url(#arr-ab)"
        strokeDasharray="4 2"
        strokeDashoffset={-t * 8}
      />
      {/* Arrow B→C */}
      <path
        d={`M ${195 + 4 * Math.sin(t * 0.6 + 1)} 58 Q 210 52 ${225 - 4 * Math.sin(t * 0.6 + 1)} 58`}
        fill="none"
        stroke="oklch(0.75 0.18 80 / 0.7)"
        strokeWidth="1.5"
        markerEnd="url(#arr-bc)"
        strokeDasharray="4 2"
        strokeDashoffset={-t * 8}
      />

      <defs>
        <marker id="arr-ab" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.65 0.18 265)" />
        </marker>
        <marker id="arr-bc" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.75 0.18 80)" />
        </marker>
      </defs>

      {/* Labels */}
      <text x="80" y="60" textAnchor="middle" fill="oklch(0.65 0.18 265)" fontSize="11" fontWeight="700" letterSpacing="0.12em">A</text>
      <text x="80" y="74" textAnchor="middle" fill="oklch(0.65 0.18 265)" fontSize="8.5" letterSpacing="0.08em">ACKNOWLEDGE</text>
      <text x="160" y="60" textAnchor="middle" fill="oklch(0.68 0.18 75)" fontSize="11" fontWeight="700" letterSpacing="0.12em">C</text>
      <text x="160" y="74" textAnchor="middle" fill="oklch(0.68 0.18 75)" fontSize="8.5" letterSpacing="0.08em">CLARIFY</text>
      <text x="240" y="60" textAnchor="middle" fill="oklch(0.65 0.18 160)" fontSize="11" fontWeight="700" letterSpacing="0.12em">T</text>
      <text x="240" y="74" textAnchor="middle" fill="oklch(0.65 0.18 160)" fontSize="8.5" letterSpacing="0.08em">TRANSFORM</text>
    </svg>
  );
}

interface StepCardProps {
  stepKey: 'acknowledge' | 'clarify' | 'takeAction';
  index: number;
}

function StepCard({ stepKey, index }: StepCardProps) {
  const step = ACT_STEPS.find((s) => s.key === stepKey)!;
  const colors = ACT_COLORS[stepKey];
  const label = STEP_LABELS[stepKey];
  const description = STEP_DESCRIPTIONS[stepKey];
  const phrase = STEP_PHRASES[stepKey];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Glass radius={RADII.xl} padding={20} style={{ marginBottom: 12 }}>
        {/* Colour accent bar */}
        <div
          style={{
            width: 32,
            height: 4,
            borderRadius: 4,
            background: colors.primary,
            marginBottom: 12,
            boxShadow: `0 0 10px ${colors.glow}`,
          }}
        />
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: colors.primary,
            marginBottom: 4,
          }}
        >
          Step {index + 1} · {label}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--pbt-text)',
            marginBottom: 8,
          }}
        >
          {step.label}
        </div>
        <p
          style={{
            fontSize: 14,
            color: 'var(--pbt-text-muted)',
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          {description}
        </p>
        {/* Quote block */}
        <div
          style={{
            borderLeft: `3px solid ${colors.primary}`,
            paddingLeft: 14,
            background: `color-mix(in oklab, ${colors.soft} 60%, transparent)`,
            borderRadius: '0 10px 10px 0',
            padding: '10px 14px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: colors.primary,
              marginBottom: 5,
              opacity: 0.8,
            }}
          >
            Example phrase
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--pbt-text)',
              fontStyle: 'italic',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {phrase}
          </p>
        </div>
        {/* Do / Don't quick tips */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {step.doExamples.slice(0, 2).map((ex, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'oklch(0.55 0.18 145)', fontSize: 13, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 12, color: 'var(--pbt-text-muted)', lineHeight: 1.4 }}>{ex}</span>
            </div>
          ))}
          {step.dontExamples.slice(0, 1).map((ex, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'oklch(0.55 0.24 18)', fontSize: 13, flexShrink: 0 }}>✗</span>
              <span style={{ fontSize: 12, color: 'var(--pbt-text-muted)', lineHeight: 1.4 }}>{ex}</span>
            </div>
          ))}
        </div>
      </Glass>
    </motion.div>
  );
}

const EXAMPLE_STEPS: { label: string; color: string; text: string }[] = [
  {
    label: 'ACKNOWLEDGE',
    color: ACT_COLORS.acknowledge.primary,
    text: '"I completely understand — budget is a real factor, and you clearly want the best for Max."',
  },
  {
    label: 'CLARIFY',
    color: ACT_COLORS.clarify.primary,
    text: '"What would make you feel confident that a food change is worth it for him?"',
  },
  {
    label: 'TRANSFORM',
    color: ACT_COLORS.takeAction.primary,
    text: '"Based on what you\'ve shared, Satiety Support is built for exactly this — 97% of dogs lost weight in 12 weeks. Let\'s do a 4-week trial."',
  },
];

export function ActGuideScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();

  return (
    <>
      <TopBar title="ACT Guide" showBack />
      <Page withTabBar>
        {/* Section 1 — Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', paddingTop: 8, marginBottom: 28 }}
        >
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 10,
            }}
          >
            Framework
          </div>
          <h2
            style={{
              fontSize: 52,
              fontWeight: 400,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              margin: '0 0 10px',
              color: 'var(--pbt-text)',
            }}
          >
            A.C.T.
          </h2>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 14,
            }}
          >
            Acknowledge · Clarify · Transform
          </div>
          <p
            style={{
              fontSize: 14,
              color: 'var(--pbt-text-muted)',
              lineHeight: 1.55,
              maxWidth: 320,
              margin: '0 auto 24px',
            }}
          >
            A proven 3-step framework for turning client pushback into meaningful conversations.
          </p>

          {/* Animated circle graphic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <ActCircleGraphic />
          </motion.div>
        </motion.div>

        {/* Section 2 — Three step cards */}
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 14,
          }}
        >
          The three steps
        </div>

        <StepCard stepKey="acknowledge" index={0} />
        <StepCard stepKey="clarify" index={1} />
        <StepCard stepKey="takeAction" index={2} />

        {/* Section 3 — Driver × ACT (only when profile exists) */}
        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginTop: 8, marginBottom: 12 }}
          >
            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                marginBottom: 14,
              }}
            >
              Your driver & ACT
            </div>
            <Glass
              radius={RADII.xl}
              padding={0}
              style={{ overflow: 'hidden' }}
            >
              {/* Wave header */}
              <div
                style={{
                  height: 48,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <DriverWave
                  driver={profile.primary}
                  height={48}
                  synthwave
                  amplitude={0.9}
                  speed={0.7}
                  opacity={0.7}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to bottom, transparent 0%, var(--pbt-glass-bg, rgba(255,255,255,0.72)) 100%)',
                  }}
                />
              </div>
              <div style={{ padding: '16px 20px 20px' }}>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-driver-primary, var(--pbt-text-muted))',
                    marginBottom: 10,
                  }}
                >
                  Your Driver · {profile.primary}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--pbt-text)',
                    lineHeight: 1.65,
                    margin: '0 0 20px',
                  }}
                >
                  {DRIVER_ACT_TIPS[profile.primary]}
                </p>
                <PillButton onClick={() => go('create')} icon={<Icon.arrow />}>
                  Practice in Simulator
                </PillButton>
              </div>
            </Glass>
          </motion.div>
        )}

        {/* Section 4 — Example in practice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: profile ? 0.65 : 0.5, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ marginTop: 8 }}
        >
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 14,
            }}
          >
            Example in practice
          </div>
          <Glass radius={RADII.xl} padding={20}>
            {/* Objection bubble */}
            <div
              style={{
                background: 'color-mix(in oklab, var(--pbt-text) 8%, transparent)',
                borderRadius: '14px 14px 14px 4px',
                padding: '12px 16px',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 5,
                }}
              >
                Client objection
              </div>
              <p
                style={{
                  fontSize: 14,
                  fontStyle: 'italic',
                  color: 'var(--pbt-text)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                "Your pricing is too high — I can get similar food at the supermarket for half the price!"
              </p>
            </div>

            {/* ACT response steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {EXAMPLE_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: `color-mix(in oklab, ${s.color} 18%, transparent)`,
                      border: `1.5px solid ${s.color}`,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: s.color,
                      letterSpacing: '0.05em',
                      marginTop: 2,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: s.color,
                        marginBottom: 4,
                      }}
                    >
                      {s.label}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--pbt-text)',
                        fontStyle: 'italic',
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {s.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Glass>
        </motion.div>

        {/* CTA if no profile */}
        {!profile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            style={{ marginTop: 16, textAlign: 'center' }}
          >
            <PillButton onClick={() => go('create')} icon={<Icon.arrow />}>
              Practice in Simulator
            </PillButton>
          </motion.div>
        )}
      </Page>
    </>
  );
}
