import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { COLORS, RADII } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { FecalScanRetrieval } from '../../shared/ai/fecalScan';
import { Eyebrow, MonoPill } from './fecalUi';

export interface GroundingPanelProps {
  retrieval: FecalScanRetrieval | null;
}

/**
 * The RAG trail — an instrument panel, not a debug dump.
 *
 * Every scan is answerable: which document the passages came from, how close
 * each one was to the observation text that was embedded, which chart scores
 * it mentions, and the passage itself. `source` is stated honestly — when
 * retrieval returned nothing the scorer used the bundled chart, and the pill
 * says so rather than implying a vector hit.
 */
export function GroundingPanel({ retrieval }: GroundingPanelProps) {
  const { resolvedTheme } = useTheme();
  const t = useT();
  const dark = resolvedTheme === 'dark';

  const sourceColor =
    retrieval?.source === 'rag' ? COLORS.score.good : COLORS.score.ok;
  const citation = retrieval?.chunks.find((c) => c.citation)?.citation ?? null;
  const referencePhotoCount = retrieval?.referenceScores?.length ?? 0;

  return (
    <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
        <Eyebrow>{t('fecalScan.grounding.eyebrow')}</Eyebrow>
        {retrieval && (
          <MonoPill color={sourceColor} dark={dark}>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: sourceColor,
                flexShrink: 0,
              }}
            />
            <span aria-label={t('fecalScan.grounding.sourceAria')} style={{ textTransform: 'none', letterSpacing: '0.04em' }}>
              {retrieval.source === 'rag'
                ? t('fecalScan.grounding.source.rag')
                : t('fecalScan.grounding.source.bundled')}
            </span>
          </MonoPill>
        )}
      </div>

      {!retrieval ? (
        <p style={idleStyle}>{t('fecalScan.grounding.idle')}</p>
      ) : (
        <>
          {/* How many chart photos the scorer actually looked at — the visual
              half of the grounding, next to the textual passages below. */}
          {referencePhotoCount > 0 && (
            <div
              style={{
                marginBottom: 10,
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 9.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
              }}
            >
              {referencePhotoCount === 1
                ? t('fecalScan.grounding.referencePhotosOne')
                : t('fecalScan.grounding.referencePhotos', { n: referencePhotoCount })}
            </div>
          )}

          {citation && (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--pbt-text)',
                paddingBottom: 12,
                borderBottom: '1px solid var(--pbt-glass-border)',
              }}
            >
              {citation}
            </div>
          )}

          {retrieval.chunks.length === 0 ? (
            <p style={{ ...idleStyle, marginTop: 12 }}>{t('fecalScan.grounding.empty')}</p>
          ) : (
            <ol style={{ listStyle: 'none', margin: '2px 0 0', padding: 0 }}>
              {retrieval.chunks.map((chunk, i) => (
                <ChunkRow
                  key={`${i}-${chunk.excerpt.slice(0, 24)}`}
                  index={i}
                  citationShown={Boolean(citation)}
                  chunk={chunk}
                  dark={dark}
                />
              ))}
            </ol>
          )}

          {/* The embedded query — what the vector search actually asked. */}
          <div style={{ marginTop: 14 }}>
            <Eyebrow style={{ marginBottom: 6 }}>
              {t('fecalScan.grounding.queryLabel')}
            </Eyebrow>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: RADII.sm,
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                lineHeight: 1.6,
                color: 'var(--pbt-text)',
                wordBreak: 'break-word',
                background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.34)',
                border: '1px solid var(--pbt-glass-border)',
              }}
            >
              {retrieval.query}
            </div>
            {retrieval.docSlugs.length > 0 && (
              <div
                style={{
                  marginTop: 7,
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.12em',
                  color: 'var(--pbt-text-muted)',
                }}
              >
                {/* Label is shouted; the slugs keep their real casing — they
                    are identifiers an admin can paste into the knowledge base. */}
                <span style={{ textTransform: 'uppercase' }}>
                  {t('fecalScan.grounding.docs')}
                </span>{' '}
                · {retrieval.docSlugs.join(' · ')}
              </div>
            )}
          </div>
        </>
      )}
    </Glass>
  );
}

const idleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: 'var(--pbt-text-muted)',
};

function ChunkRow({
  index,
  chunk,
  dark,
  citationShown,
}: {
  index: number;
  chunk: FecalScanRetrieval['chunks'][number];
  dark: boolean;
  citationShown: boolean;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const hasSimilarity = typeof chunk.similarity === 'number';
  const pct = hasSimilarity
    ? Math.max(0, Math.min(100, Math.round((chunk.similarity as number) * 100)))
    : 0;

  return (
    <li
      style={{
        padding: '12px 0',
        borderTop: index === 0 && !citationShown ? 'none' : '1px solid var(--pbt-glass-border)',
      }}
    >
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 7 }}>
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
          }}
        >
          {t('fecalScan.grounding.passage', { n: index + 1 })}
        </span>
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: hasSimilarity ? 'var(--pbt-text)' : 'var(--pbt-text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hasSimilarity
            ? (chunk.similarity as number).toFixed(2)
            : t('fecalScan.grounding.similarityNone')}
        </span>
      </div>

      {/* Similarity bar — omitted entirely when there is no number behind it. */}
      {hasSimilarity && (
        <div
          role="img"
          aria-label={`${t('fecalScan.grounding.similarity')} ${(chunk.similarity as number).toFixed(2)}`}
          style={{
            height: 3,
            borderRadius: 9999,
            overflow: 'hidden',
            marginBottom: 9,
            background: 'color-mix(in oklab, var(--pbt-driver-primary) 12%, transparent)',
          }}
        >
          <motion.div
            style={{
              height: '100%',
              borderRadius: 9999,
              background:
                'linear-gradient(90deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            }}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 * index }}
          />
        </div>
      )}

      {chunk.scores.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {chunk.scores.map((s) => (
            <MonoPill
              key={s}
              color={COLORS.score.good}
              dark={dark}
              style={{ padding: '2px 8px', fontSize: 9 }}
            >
              {t('fecalScan.chartSheet.scoreAria', { score: s })}
            </MonoPill>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--pbt-text)',
          font: 'inherit',
        }}
      >
        <span
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical' as never,
            WebkitLineClamp: expanded ? 'unset' : 2,
            overflow: 'hidden',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--pbt-text)',
          }}
        >
          {chunk.excerpt}
        </span>
        <span
          style={{
            display: 'inline-block',
            marginTop: 5,
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-driver-primary)',
          }}
        >
          {expanded ? t('fecalScan.grounding.collapse') : t('fecalScan.grounding.expand')}
        </span>
      </button>
    </li>
  );
}
