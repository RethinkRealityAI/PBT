import { DifficultyMeter, type DifficultyMeterSize } from '../../design-system/DifficultyMeter';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { localizedDifficultyLabel } from '../../i18n/dataL10n/pushbacks';
import { parseDifficulty } from '../../shared/scenarios/difficulty';

/**
 * The level a session was played at, shown BESIDE its score (History row,
 * History detail, the post-session scorecard). Scoring is the same standard
 * at every level on purpose — this only makes a 75 against a Combative owner
 * legible as the harder result it is. It never alters a score or an average.
 *
 * `level` is read tolerantly (`parseDifficulty`): records saved before
 * difficulty was stored — or hand-edited ones — render nothing at all rather
 * than a guessed level. Callers must not render it next to a
 * scoring-unavailable placeholder in a way that reads as a score.
 *
 * `caption` adds the mono "DIFFICULTY" eyebrow before the meter (hidden from
 * assistive tech — the meter's own accessible name already says it).
 */
export function SessionDifficulty({
  level,
  caption = false,
  size = 'sm',
  style,
}: {
  level: unknown;
  caption?: boolean;
  size?: DifficultyMeterSize;
  style?: React.CSSProperties;
}) {
  const { t, locale } = useLanguage();
  const d = parseDifficulty(level);
  if (d == null) return null;
  const word = localizedDifficultyLabel(d, locale);
  const meter = (
    <DifficultyMeter
      level={d}
      label={word}
      ariaLabel={t('chrome.difficulty.aria', { label: word, level: d })}
      size={size}
      style={caption ? undefined : style}
    />
  );
  if (!caption) return meter;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, ...style }}>
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
        }}
      >
        {t('chrome.difficulty.label')}
      </span>
      {meter}
    </div>
  );
}
