import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { COLORS } from '../../design-system/tokens';
import type { AiEmotion } from '../../services/types';
import { useT, type TFunction } from '../../i18n/useT';
import type { CatalogKey } from '../../i18n/catalog';

/**
 * The customer's resolution arc across the session — the same red/yellow/
 * green vocabulary the chat bubbles use (Defensive / Receptive / Convinced),
 * replayed as a segmented strip so the trainee can see exactly where the
 * client warmed up (or shut down). Hidden entirely when the transcript
 * carries no emotion data (pre-capture records).
 */

const EMOTION_COLOR: Record<AiEmotion, string> = {
  red: COLORS.score.poor,
  yellow: COLORS.score.ok,
  green: COLORS.score.good,
};

/** Enum values stay machine keys; the labels are shared with the chat bubbles. */
const EMOTION_LABEL_KEY: Record<AiEmotion, CatalogKey> = {
  red: 'chat.emotion.defensive',
  yellow: 'chat.emotion.receptive',
  green: 'chat.emotion.convinced',
};

function captionFor(journey: AiEmotion[], t: TFunction): string {
  const first = journey[0];
  const last = journey[journey.length - 1];
  if (last === 'green') {
    if (first === 'green') return t('scorecard.arc.caption.heldGreen');
    const from = t(EMOTION_LABEL_KEY[first]).toLowerCase();
    return journey.length === 1
      ? t('scorecard.arc.caption.movedToGreenOne', { from })
      : t('scorecard.arc.caption.movedToGreen', { from, count: journey.length });
  }
  if (last === 'yellow') {
    return first === 'red'
      ? t('scorecard.arc.caption.openedDoor')
      : t('scorecard.arc.caption.stayedReceptive');
  }
  return first === 'red'
    ? t('scorecard.arc.caption.stayedDefensive')
    : t('scorecard.arc.caption.closedDown');
}

export function ResolutionJourney({ journey }: { journey: AiEmotion[] }) {
  const reduceMotion = useReducedMotion();
  const t = useT();
  if (journey.length === 0) return null;

  const last = journey[journey.length - 1];
  const ariaParams = {
    from: t(EMOTION_LABEL_KEY[journey[0]]),
    to: t(EMOTION_LABEL_KEY[last]),
    count: journey.length,
  };

  return (
    <Glass radius={22} padding={18}>
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
        {t('scorecard.arc.title')}
      </div>
      <div
        role="img"
        aria-label={
          journey.length === 1
            ? t('scorecard.arc.ariaOne', ariaParams)
            : t('scorecard.arc.aria', ariaParams)
        }
        style={{ display: 'flex', gap: 4, alignItems: 'center' }}
      >
        {journey.map((e, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: 0.32,
              delay: reduceMotion ? 0 : 0.25 + i * 0.07,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              flex: 1,
              height: 10,
              borderRadius: 9999,
              background: `linear-gradient(180deg, color-mix(in oklab, ${EMOTION_COLOR[e]} 88%, white), ${EMOTION_COLOR[e]})`,
              boxShadow: `0 2px 8px -2px color-mix(in oklab, ${EMOTION_COLOR[e]} 55%, transparent)`,
              transformOrigin: 'left',
              minWidth: 10,
            }}
          />
        ))}
      </div>
      <div
        className="flex items-baseline justify-between gap-3"
        style={{ marginTop: 8 }}
      >
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: EMOTION_COLOR[journey[0]],
          }}
        >
          {t(EMOTION_LABEL_KEY[journey[0]])}
        </span>
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: EMOTION_COLOR[last],
          }}
        >
          {t(EMOTION_LABEL_KEY[last])}
        </span>
      </div>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--pbt-text)',
        }}
      >
        {captionFor(journey, t)}
      </p>
    </Glass>
  );
}
