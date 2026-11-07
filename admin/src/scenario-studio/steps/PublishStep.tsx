/**
 * Step 7 · Publish — how trainees will see it, whether it's ready, and the
 * switch that puts it in front of them.
 *
 * The preview is the Training library card trainees tap (the trainee app's
 * own card body — see CardPreview). The card fields never change the AI.
 * The card's start button, "More info" panel, subtitle and colour are retired
 * (2026-11-07): the library card has none of them (it takes each trainee's
 * own ECHO colour), so the Studio no longer asks for them — the stored values
 * are kept, untouched (see RETIRED_CARD_FIELDS).
 * The readiness checklist is the same `readiness()` the header's Publish
 * button consults, with a "Fix it →" jump to the step that fixes each item.
 */
import type { ReactNode } from 'react';
import { COLOR } from '../../lib/tokens';
import { Button, InlineAlert } from '../../primitives/form';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import { speciesOf } from '../../../../src/shared/scenarios/species';
import {
  Explainer,
  FieldBlock,
  Kicker,
  StatusDot,
  StudioSection,
  TextInput,
  useFieldId,
} from '../ui';
import { CardPreview, libraryCardPreview } from '../CardPreview';
import { STUDIO_STEPS, canPublish, readiness, stepIndex, type ReadinessItem } from '../studioModel';
import type { StepProps } from '../types';
import { useObjectionsContext } from '../objections/ObjectionsContext';

export interface PublishStepProps extends StepProps {
  /** Trainees can see the saved version right now. */
  live: boolean;
  /** The server has this scenario (false = only in this browser). */
  savedOnce: boolean;
  /** There are edits the server doesn't have. */
  dirty: boolean;
  busy: 'save' | 'publish' | 'unpublish' | null;
  /** The last save couldn't store the species (the column isn't there yet). */
  speciesPending: boolean;
  fallbackTitle?: string | null;
  /**
   * What trainees get: for a library scenario, blank fields inherit the
   * built-in values (`withBaseFallback`). Defaults to `draft`.
   */
  previewDraft?: StepProps['draft'];
  onPublish: () => void;
  onSaveDraft: () => void;
  onUnpublish: () => void;
  /** For trainee-built scenarios: add a copy to the library (it can be published). */
  onDuplicate: () => void;
}

export function PublishStep(props: PublishStepProps) {
  const {
    draft,
    patch,
    canWrite,
    ctx,
    goTo,
    source,
    live,
    savedOnce,
    dirty,
    busy,
    speciesPending,
    fallbackTitle,
  } = props;
  const previewDraft = props.previewDraft ?? draft;
  const { objections, categories } = useObjectionsContext();
  // The title the card prints when the box is empty (the objection's name).
  const defaultTitle = libraryCardPreview(
    { ...previewDraft, card_title_override: null },
    { fallbackTitle, objections, categories },
  ).title;
  const items = readiness(draft, ctx);
  const ready = canPublish(items);
  const requiredOpen = items.filter((i) => !i.ok && i.level === 'required').length;

  const titleId = useFieldId();
  const sortId = useFieldId();
  const L = SCENARIO_LIMITS;

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {speciesPending && speciesOf(draft.species) === 'cat' && (
        <InlineAlert tone="warn" title="Trainees will see this as a dog scenario for now">
          The species couldn’t be stored yet — a database update is still pending. Everything else
          saved. Once the update is applied, save again and the AI owner will talk about a cat.
        </InlineAlert>
      )}

      {/* ── The card ── */}
      {/* Preview first in reading order; on the right when there's room, on
          top (left-aligned) when the two wrap. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: '0 1 340px', minWidth: 'min(280px, 100%)', display: 'grid', gap: 10 }}>
          <Kicker>What trainees see</Kicker>
          <CardPreview draft={previewDraft} fallbackTitle={fallbackTitle} />
          <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
            Updates as you type. This is the card in the Training library — trainees tap it to
            start. It never changes how the AI owner behaves. In the app it takes each trainee’s
            own ECHO colour.
          </div>
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'grid', gap: 18 }}>
          <StudioSection title="The card" hint="Every box is optional — an empty one shows, in grey, what the app prints instead.">
            <FieldBlock
              label="Card title"
              htmlFor={titleId}
              optional
              count={{ value: (draft.card_title_override ?? '').length, max: L.cardTitleMax }}
              hint="Empty = the pushback’s name."
            >
              <TextInput
                id={titleId}
                value={draft.card_title_override ?? ''}
                maxLength={L.cardTitleMax}
                placeholder={defaultTitle}
                disabled={!canWrite}
                onChange={(e) => patch({ card_title_override: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock
              label="Position in the Training library"
              htmlFor={sortId}
              optional
              hint="Lower numbers come first. Leave empty for the usual order."
            >
              <TextInput
                id={sortId}
                type="number"
                inputMode="numeric"
                step={1}
                value={draft.sort_order ?? ''}
                placeholder="Usual order"
                disabled={!canWrite}
                style={{ maxWidth: 180 }}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Number(raw);
                  // A Postgres `int`: clamp so "1e21" can't turn a save into a 500.
                  const max = SCENARIO_LIMITS.sortOrderMax;
                  patch({
                    sort_order:
                      raw === '' || !Number.isFinite(n) ? null : Math.max(-max, Math.min(max, Math.round(n))),
                  });
                }}
              />
            </FieldBlock>
          </StudioSection>
        </div>
      </div>

      {/* ── Readiness ── */}
      <StudioSection
        title="Ready to go live?"
        hint={
          ready
            ? 'Everything required is in place.'
            : `${requiredOpen} required ${requiredOpen === 1 ? 'thing is' : 'things are'} missing before trainees can see it.`
        }
      >
        <ul aria-label="Readiness checklist" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <ReadinessRow key={item.key} item={item} onFix={() => goTo(item.step)} />
          ))}
        </ul>
      </StudioSection>

      {/* ── Publish controls ── */}
      {source === 'user' ? (
        <InlineAlert tone="warn" title="Trainee-built scenarios can’t be published from here">
          <div>
            This one belongs to the trainee who built it, and the app keeps showing them their own
            version. To offer it to everyone, add it to the library — the copy starts as a hidden
            draft you can polish first.
          </div>
          {canWrite && (
            <div style={{ marginTop: 10 }}>
              <Button tone="primary" size="sm" onClick={props.onDuplicate}>
                Add to library
              </Button>
            </div>
          )}
        </InlineAlert>
      ) : (
        <div
          style={{
            padding: 18,
            borderRadius: 18,
            border: `1px solid ${live ? `color-mix(in oklab, ${COLOR.success} 30%, transparent)` : COLOR.border}`,
            background: live
              ? `color-mix(in oklab, ${COLOR.successSoft} 55%, white)`
              : 'rgba(255,255,255,0.6)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {live ? (
              <StatusDot tone="success">Live — trainees can practise this scenario</StatusDot>
            ) : savedOnce ? (
              <StatusDot tone="neutral">Saved as a draft — trainees can’t see it yet</StatusDot>
            ) : (
              <StatusDot tone="warn">Not saved yet — it only exists in this browser</StatusDot>
            )}
            {live && dirty && (
              <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>
                · You have changes trainees don’t see yet.
              </span>
            )}
          </div>
          {canWrite ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                tone="primary"
                busy={busy === 'publish'}
                disabled={busy !== null}
                onClick={props.onPublish}
                style={{ padding: '10px 18px', fontSize: 14 }}
              >
                {live ? 'Update live scenario' : 'Publish to trainees'}
              </Button>
              {!live && (
                <Button tone="secondary" busy={busy === 'save'} disabled={busy !== null} onClick={props.onSaveDraft}>
                  Save as draft
                </Button>
              )}
              {live && (
                <Button tone="secondary" busy={busy === 'unpublish'} disabled={busy !== null} onClick={props.onUnpublish}>
                  Unpublish
                </Button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>
              Publishing needs edit access to scenarios.
            </div>
          )}
          <Explainer>
            There’s one version of each scenario. Publishing (or updating) changes what trainees get
            from their next session; unpublishing hides it again without deleting anything. Until
            then, your edits are kept in this browser.
          </Explainer>
        </div>
      )}
    </div>
  );
}

function ReadinessRow({ item, onFix }: { item: ReadinessItem; onFix: () => void }) {
  const tone = item.ok ? COLOR.success : item.level === 'required' ? COLOR.danger : COLOR.warn;
  const soft = item.ok ? COLOR.successSoft : item.level === 'required' ? COLOR.dangerSoft : COLOR.warnSoft;
  const fixable = !item.ok && item.step !== 'publish';
  const stepLabel = STUDIO_STEPS[stepIndex(item.step)].label;
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 14,
        background: item.ok ? 'rgba(255,255,255,0.55)' : `color-mix(in oklab, ${soft} 60%, white)`,
        border: `1px solid ${item.ok ? COLOR.borderSoft : `color-mix(in oklab, ${tone} 25%, transparent)`}`,
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 999,
          background: item.ok ? tone : 'white',
          border: `1.5px solid ${tone}`,
          color: item.ok ? '#fff' : tone,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          marginTop: 1,
        }}
      >
        {item.ok ? '✓' : '!'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink }}>
          <span style={srOnly}>
            {item.ok ? 'Done: ' : item.level === 'required' ? 'Required: ' : 'Recommended: '}
          </span>
          {item.label}
          {!item.ok && item.level === 'recommended' && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: COLOR.inkMute }}>
              Recommended
            </span>
          )}
        </div>
        {item.detail && !item.ok && (
          <div style={{ marginTop: 2, fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.45 }}>{item.detail}</div>
        )}
      </div>
      {fixable && (
        <FixLink onClick={onFix} label={`Fix it on ${stepLabel}`}>
          Fix it →
        </FixLink>
      )}
    </li>
  );
}

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function FixLink({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="pbt-btn"
      onClick={onClick}
      aria-label={label}
      style={{
        flexShrink: 0,
        border: 'none',
        background: 'rgba(255,255,255,0.85)',
        borderRadius: 999,
        padding: '5px 12px',
        fontSize: 12.5,
        fontWeight: 800,
        color: COLOR.brand,
        cursor: 'pointer',
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {children}
    </button>
  );
}
