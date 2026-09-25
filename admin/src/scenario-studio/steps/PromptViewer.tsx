/**
 * "See the full briefing" — the exact system prompt the server would hand
 * the AI customer for the draft on screen (built server-side with the live
 * AI tuning config), with the admin's own notes highlighted so they can see
 * precisely where their words land.
 */
import { Fragment, useState, type CSSProperties } from 'react';
import { COLOR } from '../../lib/tokens';
import { StatusPill } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { missingScenarioFields } from '../../../../src/shared/scenarios/draftToScenario';
import type { StudioDraft, StudioStepKey } from '../studioModel';
import { Spinner } from '../ui';
import { isHeadingLine, segmentPrompt, type PromptSegment } from './briefModel';
import { MissingNotice } from './stepParts';
import { useInspect } from './useInspect';

const MISSING_LEAD = 'Finish the pet, pushback and owner steps first — the briefing is built from them.';

const MARK_STYLE: Record<'scenario' | 'global', CSSProperties> = {
  scenario: {
    background: COLOR.brandSoft,
    color: COLOR.ink,
    borderRadius: 4,
    padding: '1px 2px',
    boxShadow: `inset 0 -2px 0 color-mix(in oklab, ${COLOR.brand} 45%, transparent)`,
  },
  global: {
    background: COLOR.infoSoft,
    color: COLOR.ink,
    borderRadius: 4,
    padding: '1px 2px',
    boxShadow: `inset 0 -2px 0 color-mix(in oklab, ${COLOR.info} 40%, transparent)`,
  },
};

const HEADING_STYLE: CSSProperties = {
  fontWeight: 800,
  color: COLOR.ink,
  letterSpacing: '0.02em',
};

function renderPlain(text: string, key: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={`${key}-${i}`}>
      {isHeadingLine(line) ? <span style={HEADING_STYLE}>{line}</span> : line}
      {i < lines.length - 1 ? '\n' : null}
    </Fragment>
  ));
}

function renderSegment(seg: PromptSegment, i: number) {
  if (seg.kind === 'plain') return renderPlain(seg.text, `s${i}`);
  return (
    <mark
      key={`m${i}`}
      data-note={seg.kind}
      title={seg.kind === 'scenario' ? 'Your note' : 'From AI tuning — applies to every scenario'}
      style={MARK_STYLE[seg.kind]}
    >
      {seg.text}
    </mark>
  );
}

function Swatch({ kind, children }: { kind: 'scenario' | 'global'; children: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 14, height: 10, borderRadius: 3, ...MARK_STYLE[kind], padding: 0 }} />
      {children}
    </span>
  );
}

export function PromptViewer({
  draft,
  goTo,
}: {
  draft: StudioDraft;
  goTo: (step: StudioStepKey) => void;
}) {
  const inspect = useInspect(draft, 'prompt');
  const [open, setOpen] = useState(false);
  const localMissing = missingScenarioFields(draft);
  const data = inspect.data;
  const loading = inspect.status === 'loading';

  if (!open) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <Button
            tone="secondary"
            disabled={localMissing.length > 0}
            onClick={() => {
              setOpen(true);
              inspect.run();
            }}
          >
            See the full briefing
          </Button>
        </div>
        {localMissing.length > 0 && <MissingNotice missing={localMissing} goTo={goTo} lead={MISSING_LEAD} />}
      </div>
    );
  }

  const prompt = data?.prompt ? data.prompt.replace(/^\n+/, '') : null;
  const notes = data?.adminNotes ?? {
    scenarioPrefix: null,
    scenarioSuffix: null,
    globalPrefix: null,
    globalSuffix: null,
  };
  const hasGlobal = Boolean(notes.globalPrefix?.trim() || notes.globalSuffix?.trim());
  const hasOwn = Boolean(notes.scenarioPrefix?.trim() || notes.scenarioSuffix?.trim());

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {prompt && (
          <span style={{ fontFamily: 'var(--pbt-mono)', fontSize: 11.5, color: COLOR.inkMute }}>
            {prompt.length.toLocaleString('en')} characters
          </span>
        )}
        {inspect.stale && !loading && <StatusPill tone="warn">Out of date — the scenario changed</StatusPill>}
        {loading && (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: COLOR.inkMute }}>
            <Spinner label="Building the briefing" /> Building the briefing…
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <Button size="sm" onClick={inspect.run} disabled={loading || localMissing.length > 0}>
            Refresh
          </Button>
          <Button size="sm" tone="ghost" onClick={() => setOpen(false)}>
            Hide
          </Button>
        </span>
      </div>

      {inspect.status === 'error' && (
        <InlineAlert tone="error" title="The briefing didn’t load">
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

      {data && data.missing.length > 0 && (
        <MissingNotice missing={data.missing} goTo={goTo} lead={MISSING_LEAD} />
      )}

      {prompt && (
        <>
          {(hasOwn || hasGlobal) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: COLOR.inkSoft }}>
              {hasOwn && <Swatch kind="scenario">Your notes</Swatch>}
              {hasGlobal && <Swatch kind="global">From AI tuning — every scenario</Swatch>}
            </div>
          )}
          <div
            className="pbt-studio-scroll"
            role="region"
            aria-label="The full briefing"
            tabIndex={0}
            data-testid="briefing"
            style={{
              maxHeight: 420,
              overflowY: 'auto',
              padding: '16px 18px',
              borderRadius: 16,
              background: 'rgba(60,20,15,0.035)',
              border: `1px solid ${COLOR.border}`,
              fontFamily: 'var(--pbt-mono)',
              fontSize: 12,
              lineHeight: 1.65,
              color: COLOR.inkSoft,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              opacity: loading || inspect.stale ? 0.65 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {segmentPrompt(prompt, notes).map(renderSegment)}
          </div>
        </>
      )}

      {!data && loading && (
        <div
          style={{
            height: 160,
            borderRadius: 16,
            background: 'rgba(60,20,15,0.035)',
            border: `1px solid ${COLOR.border}`,
          }}
        />
      )}
    </div>
  );
}
