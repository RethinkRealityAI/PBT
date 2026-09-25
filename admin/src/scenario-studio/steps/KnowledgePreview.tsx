/**
 * "Preview what the AI will read" — the server runs the SAME roleplay
 * retrieval a real session runs, for the draft on screen, and hands back the
 * passages plus the scope it actually applied. Read-only.
 */
import { COLOR } from '../../lib/tokens';
import { StatusPill } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import type { InspectPassage } from '../../../../src/shared/ai/contract';
import { missingScenarioFields } from '../../../../src/shared/scenarios/draftToScenario';
import type { StudioDraft, StudioStepKey } from '../studioModel';
import { Spinner } from '../ui';
import { knowledgeModeOf, relevanceLabel, scopeSentence } from './knowledgeModel';
import { MissingNotice } from './stepParts';
import { useInspect } from './useInspect';

const MISSING_LEAD = 'Finish the pet, pushback and owner steps first so there’s something to search for.';

export function KnowledgePreview({
  draft,
  goTo,
}: {
  draft: StudioDraft;
  goTo: (step: StudioStepKey) => void;
}) {
  const inspect = useInspect(draft, 'knowledge');
  const localMissing = missingScenarioFields(draft);
  const data = inspect.data;
  const loading = inspect.status === 'loading';
  const attached = draft.knowledge_slugs?.length ?? 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          tone={data ? 'secondary' : 'primary'}
          onClick={inspect.run}
          disabled={localMissing.length > 0}
          busy={loading}
        >
          {data ? 'Refresh the preview' : 'Preview what the AI will read'}
        </Button>
        {loading && (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: COLOR.inkMute }}>
            <Spinner label="Searching" /> Running the same search a real session runs…
          </span>
        )}
        {inspect.stale && !loading && (
          <StatusPill tone="warn">Out of date — the scenario changed</StatusPill>
        )}
      </div>

      {localMissing.length > 0 && !data && (
        <MissingNotice missing={localMissing} goTo={goTo} lead={MISSING_LEAD} />
      )}

      {inspect.status === 'error' && (
        <InlineAlert tone="error" title="The preview didn’t load">
          {inspect.error}{' '}
          <button
            type="button"
            onClick={inspect.run}
            style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try again
          </button>
        </InlineAlert>
      )}

      {data && (
        <div
          aria-busy={loading || undefined}
          style={{ display: 'grid', gap: 12, opacity: loading || inspect.stale ? 0.6 : 1, transition: 'opacity 0.15s ease' }}
        >
          {data.missing.length > 0 ? (
            <MissingNotice missing={data.missing} goTo={goTo} lead={MISSING_LEAD} />
          ) : (
            <>
              <div
                style={{
                  padding: '9px 13px',
                  borderRadius: 12,
                  background: COLOR.infoSoft,
                  color: 'oklch(0.40 0.13 245)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {scopeSentence(data.knowledge.appliedFilter, data.knowledge.mode ?? knowledgeModeOf(draft), attached)}
              </div>
              {!data.knowledge.enabled && (
                <InlineAlert tone="info" title="Research grounding is switched off">
                  Research grounding is switched off for every scenario in AI tuning, so the AI customer
                  runs on its standard briefing and reads none of these documents.
                </InlineAlert>
              )}
              {data.knowledge.focusRelaxed && (
                <InlineAlert tone="warn">
                  Nothing on this topic matched, so the search widened to the whole library — a real
                  session does the same. File documents under the topic, or attach specific ones.
                </InlineAlert>
              )}
              {data.knowledge.enabled && data.knowledge.passages.length === 0 && (
                <div style={{ fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.55 }}>
                  Nothing matched. The AI customer will run on its standard briefing, without research, for
                  this scenario.
                </div>
              )}
              {data.knowledge.passages.length > 0 && (
                <>
                  <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>
                    The AI reads the {data.knowledge.passages.length} most relevant passage
                    {data.knowledge.passages.length === 1 ? '' : 's'} once per conversation (it looks for
                    up to {data.knowledge.k}).
                  </div>
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                    {data.knowledge.passages.map((p, i) => (
                      <PassageCard key={`${p.slug ?? 'p'}-${i}`} passage={p} index={i} />
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PassageCard({ passage, index }: { passage: InspectPassage; index: number }) {
  const relevance = relevanceLabel(passage.similarity);
  return (
    <li
      style={{
        display: 'grid',
        gap: 8,
        padding: '14px 16px',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.78)',
        border: `1px solid ${COLOR.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span
          aria-hidden
          style={{ fontFamily: 'var(--pbt-mono)', fontSize: 11, fontWeight: 700, color: COLOR.inkMute }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink, flex: '1 1 200px', minWidth: 0 }}>
          {passage.title ?? 'Untitled passage'}
        </span>
        {relevance && <StatusPill tone="info" dot={false}>{relevance}</StatusPill>}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: COLOR.inkSoft, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {passage.snippet}
      </div>
      {passage.citation && (
        <div style={{ fontSize: 11.5, color: COLOR.inkMute, fontStyle: 'italic' }}>{passage.citation}</div>
      )}
    </li>
  );
}
