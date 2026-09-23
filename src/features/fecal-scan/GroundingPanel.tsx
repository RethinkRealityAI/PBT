import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { RADII } from '../../design-system/tokens';
import { useT } from '../../i18n/useT';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { LOCALE_BCP47 } from '../../i18n/locales';
import type { CatalogKey } from '../../i18n/catalog';
import type { FecalScanRetrieval } from '../../shared/ai/fecalScan';
import {
  Eyebrow,
  LevelMeter,
  MonoPill,
  relevanceLevel,
  subtleSurface,
  type Level,
} from './fecalUi';

type Chunk = FecalScanRetrieval['chunks'][number];

export interface GroundingPanelProps {
  retrieval: FecalScanRetrieval | null;
  /**
   * The model's own 0–1 confidence. The result card shows it as a coarse
   * High / Moderate / Low; the precise number lives in Technical details for
   * anyone who needs it.
   */
  confidence?: number | null;
}

const KIND_KEY: Record<NonNullable<Chunk['kind']> | 'unknown', CatalogKey> = {
  chart: 'fecalScan.grounding.kind.chart',
  supplement: 'fecalScan.grounding.kind.supplement',
  unknown: 'fecalScan.grounding.kind.unknown',
};

const MATCH_KEY: Record<Level, CatalogKey> = {
  3: 'fecalScan.grounding.match.strong',
  2: 'fecalScan.grounding.match.good',
  1: 'fecalScan.grounding.match.partial',
};

/** Scope keys the search can report → the catalog label shown to the tech. */
const SCOPE_SPECIES_KEY: Record<string, CatalogKey> = {
  dog: 'fecalScan.species.dog',
  puppy: 'fecalScan.species.puppy',
  cat: 'fecalScan.species.cat',
};
const SCOPE_TOOL_KEY: Record<string, CatalogKey> = {
  'fecal-scan': 'fecalScan.title',
};

/**
 * "Where this score came from" — the retrieval trail, in plain language.
 *
 * A vet tech sees WHICH source each passage came from (the Royal Canin chart,
 * or a note the clinic filed itself), how well it matched, and the passage
 * text; plus how many chart photos the scorer compared against. The
 * machinery — the embedded query, the search scope, document ids, vector vs
 * bundled provenance and the raw numbers — sits behind a collapsed
 * "Technical details" disclosure for the people who ask.
 */
export function GroundingPanel({ retrieval, confidence = null }: GroundingPanelProps) {
  const t = useT();
  const citation = retrieval?.chunks.find((c) => c.citation)?.citation ?? null;
  const referencePhotoCount = retrieval?.referenceScores?.length ?? 0;

  return (
    <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
      <Eyebrow accent as="h2" style={{ marginBottom: 12 }}>
        {t('fecalScan.grounding.eyebrow')}
      </Eyebrow>

      {!retrieval ? (
        <p style={mutedText}>{t('fecalScan.grounding.idle')}</p>
      ) : (
        <>
          {/* Trust summary: the source document + the visual comparison. */}
          {(citation || referencePhotoCount > 0) && (
            <div
              style={{
                display: 'grid',
                gap: 8,
                padding: '12px 14px',
                borderRadius: RADII.sm,
                marginBottom: 4,
                ...subtleSurface,
              }}
            >
              {citation && (
                <SummaryRow icon={<Icon.book style={summaryIcon} aria-hidden />}>
                  {citation}
                </SummaryRow>
              )}
              {referencePhotoCount > 0 && (
                <SummaryRow icon={<Icon.layers style={summaryIcon} aria-hidden />}>
                  {referencePhotoCount === 1
                    ? t('fecalScan.grounding.referencePhotosOne')
                    : t('fecalScan.grounding.referencePhotos', { n: referencePhotoCount })}
                </SummaryRow>
              )}
            </div>
          )}

          {retrieval.chunks.length === 0 ? (
            <p style={{ ...mutedText, marginTop: 12 }}>{t('fecalScan.grounding.empty')}</p>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {retrieval.chunks.map((chunk, i) => (
                <ChunkRow
                  key={`${i}-${chunk.excerpt.slice(0, 24)}`}
                  index={i}
                  chunk={chunk}
                  citationShown={Boolean(citation)}
                  // A null-similarity chunk BESIDE retrieved ones is the rest
                  // of the chart the scorer also saw; alone (bundled path) it
                  // is simply the chart.
                  restOfChart={
                    chunk.similarity == null &&
                    retrieval.chunks.some((c) => typeof c.similarity === 'number')
                  }
                />
              ))}
            </ol>
          )}

          <TechnicalDetails retrieval={retrieval} confidence={confidence} />
        </>
      )}
    </Glass>
  );
}

const mutedText: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: 'var(--pbt-text-muted)',
};

const summaryIcon: CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  color: 'var(--fecal-accent-ink)',
  marginTop: 1,
};

function SummaryRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {icon}
      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--pbt-text)' }}>{children}</span>
    </div>
  );
}

function ChunkRow({
  index,
  chunk,
  citationShown,
  restOfChart,
}: {
  index: number;
  chunk: Chunk;
  citationShown: boolean;
  restOfChart: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // Only offer "Read more" when the clamp actually hides text.
  const excerptRef = useRef<HTMLSpanElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = excerptRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, chunk.excerpt]);
  // No similarity → no match strength claimed (never a "0%" match).
  const hasSimilarity =
    typeof chunk.similarity === 'number' && Number.isFinite(chunk.similarity);
  const level = hasSimilarity ? relevanceLevel(chunk.similarity as number) : null;
  const kind = chunk.kind ?? 'unknown';
  // The chart's own title repeats the citation above; a clinic note (or a
  // passage of unknown origin) must always name the document it came from.
  const showDocTitle = Boolean(chunk.docTitle) && (kind !== 'chart' || !citationShown);

  return (
    <li
      style={{
        padding: '14px 0',
        borderTop: index === 0 ? 'none' : '1px solid var(--fecal-hairline)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: '6px 12px', marginBottom: 8 }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: kind === 'supplement' ? 'var(--pbt-text)' : 'var(--pbt-text-muted)',
          }}
        >
          {t(restOfChart ? 'fecalScan.grounding.kind.restOfChart' : KIND_KEY[kind])}
        </span>
        {restOfChart && (
          <span style={{ fontSize: 11.5, color: 'var(--pbt-text-muted)' }}>
            {t('fecalScan.grounding.match.alsoConsidered')}
          </span>
        )}
        {level && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LevelMeter level={level} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pbt-text)' }}>
              {t(MATCH_KEY[level])}
            </span>
          </span>
        )}
      </div>

      {showDocTitle && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.45,
            marginBottom: 5,
            color: 'var(--pbt-text)',
          }}
        >
          {chunk.docTitle}
        </div>
      )}

      <span
        ref={excerptRef}
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical' as never,
          WebkitLineClamp: expanded ? 'unset' : 3,
          overflow: 'hidden',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--pbt-text)',
        }}
      >
        {chunk.excerpt}
      </span>

      <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 8 }}>
        {chunk.scores.map((s) => (
          <MonoPill key={s}>{t('fecalScan.chartSheet.scoreAria', { score: s })}</MonoPill>
        ))}
        {(clamped || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={linkButton}
          >
            {expanded ? t('fecalScan.grounding.collapse') : t('fecalScan.grounding.expand')}
          </button>
        )}
      </div>
    </li>
  );
}

/** Quiet text button: neutral ink, driver-coloured underline, 44px tall. */
const linkButton: CSSProperties = {
  marginLeft: 'auto',
  minHeight: 44,
  padding: '0 2px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font-body)',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--pbt-text)',
  textDecoration: 'underline',
  textDecorationColor: 'var(--fecal-accent-ink)',
  textDecorationThickness: 2,
  textUnderlineOffset: 4,
};

function TechnicalDetails({
  retrieval,
  confidence,
}: {
  retrieval: FecalScanRetrieval;
  confidence: number | null;
}) {
  const { t, locale } = useLanguage();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const fmt = new Intl.NumberFormat(LOCALE_BCP47[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const scopeTool = SCOPE_TOOL_KEY[retrieval.scope.tool];
  const scopeSpecies = SCOPE_SPECIES_KEY[retrieval.scope.species];
  const similarities = retrieval.chunks
    .map((c) => c.similarity)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid var(--fecal-hairline)' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '4px 0 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--pbt-text-muted)',
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
      >
        {t('fecalScan.grounding.technical')}
        <Icon.chevronDown
          aria-hidden
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: 'var(--fecal-accent-ink)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: reduce ? 'none' : 'transform 0.2s ease',
          }}
        />
      </button>

      {open && (
        <motion.div
          id={panelId}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <dl
            style={{
              margin: '4px 0 0',
              padding: '12px 14px',
              borderRadius: RADII.sm,
              display: 'grid',
              gap: 10,
              ...subtleSurface,
            }}
          >
            <DetailRow label={t('fecalScan.grounding.tech.retrieval')}>
              {retrieval.source === 'rag'
                ? t('fecalScan.grounding.source.rag')
                : t('fecalScan.grounding.source.bundled')}
            </DetailRow>
            <DetailRow label={t('fecalScan.grounding.tech.scope')}>
              {[
                scopeTool ? t(scopeTool) : retrieval.scope.tool,
                scopeSpecies ? t(scopeSpecies) : retrieval.scope.species,
              ].join(' · ')}
            </DetailRow>
            <DetailRow label={t('fecalScan.grounding.queryLabel')} mono>
              {retrieval.query}
            </DetailRow>
            {retrieval.docSlugs.length > 0 && (
              <DetailRow label={t('fecalScan.grounding.docs')} mono>
                {/* Real casing — identifiers an admin can paste into the knowledge base. */}
                {retrieval.docSlugs.join(' · ')}
              </DetailRow>
            )}
            {similarities.length > 0 && (
              <DetailRow label={t('fecalScan.grounding.similarity')} mono>
                {similarities.map((s) => fmt.format(s)).join(' · ')}
              </DetailRow>
            )}
            {typeof confidence === 'number' && (
              <DetailRow label={t('fecalScan.grounding.tech.confidence')} mono>
                {fmt.format(confidence)}
              </DetailRow>
            )}
          </dl>
        </motion.div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
          marginBottom: 3,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? 'var(--pbt-font-mono)' : undefined,
          fontSize: mono ? 11 : 12.5,
          lineHeight: 1.55,
          color: 'var(--pbt-text)',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </dd>
    </div>
  );
}
