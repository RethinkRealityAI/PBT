/**
 * Step 4 — "What should the AI know?"
 *
 * By default a scenario reads its CATEGORY's knowledge (the documents and
 * topic attached to e.g. Probiotics) — or, when the category has none, the
 * whole library. Two overrides for this scenario only: specific documents,
 * or one topic. Each comes with honest status, an inline upload that files
 * AND attaches a new document (to this scenario, or to the category), and a
 * preview that runs the real retrieval for the draft on screen.
 *
 * The mode is derived from the draft (documents → topic → inherited), with
 * one piece of local state: after picking "One topic" or "Specific
 * documents" the admin needs to see the chooser BEFORE anything is chosen,
 * and an untouched choice leaves the draft inheriting.
 *
 * "Whole library" can't be stored as an override while the category HAS
 * knowledge: a scenario with no choice of its own inherits (the server's
 * `effectiveKnowledge`), so that tile only appears when inheriting already
 * means the whole library.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Library, Pin, Target, type LucideIcon } from 'lucide-react';
import type { StepProps } from '../types';
import { Chip, Explainer, IconBadge, OptionTile, StudioSection } from '../ui';
import { COLOR } from '../../lib/tokens';
import { Button, InlineAlert } from '../../primitives/form';
import { useCan } from '../../primitives/access';
import { useToast } from '../../primitives/Toast';
import type { IngestResult } from '../../data/queries';
import { FOCUS_AREAS, focusAreaLabel } from '../../../../src/shared/knowledge/focusAreas';
import { missingKnowledgeSlugs } from '../studioModel';
import {
  KNOWLEDGE_CAP,
  attachSlugPatch,
  draftRetrievalSpecies,
  focusCounts,
  inheritedKnowledge,
  knowledgeModeOf,
  readableDocCount,
  speciesPlural,
  switchKnowledgeMode,
  type KnowledgeMode,
} from './knowledgeModel';
import { useObjectionsContext } from '../objections/ObjectionsContext';
import { CategoryEditor } from '../objections/CategoryEditor';
import { knowledgeOf, knowledgeSummaryText } from '../objections/categoriesModel';
import { DocumentPicker } from './DocumentPicker';
import { KnowledgePreview } from './KnowledgePreview';
import { KnowledgeUpload } from './KnowledgeUpload';
import { Caption, FitGrid, Group, StepBody, linkButton } from './stepParts';

interface ModeTile {
  key: KnowledgeMode;
  title: string;
  description: string;
  icon: LucideIcon;
  recommended?: boolean;
}

/**
 * The three tiles. The first ("library" in draft terms = no choice of its
 * own) reads as the category's knowledge when the category has some.
 */
function modeTiles(categoryName: string | null, categoryHasKnowledge: boolean, summary: string | null): ModeTile[] {
  const inherit: ModeTile =
    categoryName && categoryHasKnowledge
      ? {
          key: 'library',
          title: `Use ${knowledgeOf(categoryName)}`,
          description: `What every scenario in ${categoryName} reads${summary ? `: ${summary}` : ''}. Kept up to date in one place.`,
          icon: FolderOpen,
          recommended: true,
        }
      : {
          key: 'library',
          title: 'Whole library',
          description: categoryName
            ? `${categoryName} has no knowledge attached yet, so the AI searches everything it’s allowed to read.`
            : 'The AI searches everything it’s allowed to read and picks what fits. Right for most scenarios.',
          icon: Library,
          recommended: true,
        };
  return [
    inherit,
    {
      key: 'documents',
      title: 'Pick documents for this scenario only',
      description: categoryHasKnowledge
        ? `Only the documents you tick — instead of ${categoryName ? knowledgeOf(categoryName) : 'the category’s knowledge'}.`
        : 'Only the documents you tick. The most control — and the most upkeep.',
      icon: Pin,
    },
    {
      key: 'focus',
      title: 'One topic for this scenario only',
      description: 'Only documents filed under one clinical topic — a urinary scenario stops pulling weight-loss studies.',
      icon: Target,
    },
  ];
}

export function KnowledgeStep({ draft, patch, canWrite, knowledge, goTo }: StepProps) {
  const can = useCan();
  const toast = useToast();
  const objectionsApi = useObjectionsContext();
  const inherited = inheritedKnowledge(draft, objectionsApi.objections, objectionsApi.categories);
  const category = inherited.category;
  const categoryHasKnowledge = inherited.knowledge !== null;
  const categorySummary = inherited.knowledge ? knowledgeSummaryText(inherited.knowledge) : null;
  const tiles = modeTiles(category?.name ?? null, categoryHasKnowledge, categorySummary);
  const canEditCategory = canWrite && objectionsApi.available && category !== null;
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const derived = knowledgeModeOf(draft);
  const [chosen, setChosen] = useState<KnowledgeMode>(derived);
  const [notice, setNotice] = useState<{ text: string; undo: Parameters<typeof patch>[0] } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Slugs uploaded in this visit: they are real even before the refetched
  // library includes them, so they must not flash up as "missing".
  const [recent, setRecent] = useState<string[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Set by this step's own patches, so the effect below can tell "the admin
  // unticked the last document" (stay on Specific documents) from "the
  // assistant or a revert switched to the whole library" (follow it).
  const ownChange = useRef(false);
  const ownPatch = (p: Parameters<typeof patch>[0]) => {
    ownChange.current = true;
    patch(p);
  };

  useEffect(() => {
    if (derived !== 'library') setChosen(derived);
    else if (!ownChange.current) setChosen('library');
  }, [derived]);
  useEffect(() => {
    ownChange.current = false;
  });
  const mode: KnowledgeMode = derived === 'library' ? chosen : derived;

  const scope = draftRetrievalSpecies(draft);
  const docsReady = !knowledge.loading && !knowledge.error;
  const selected = draft.knowledge_slugs ?? [];
  const missing = docsReady
    ? missingKnowledgeSlugs(selected, [...knowledge.docs.map((d) => d.slug), ...recent])
    : [];
  const counts = useMemo(() => focusCounts(knowledge.docs, scope), [knowledge.docs, scope]);
  const focus = draft.focus_area ?? null;
  const canReadLibrary = can('knowledge.read');
  const canUpload = canWrite && can('knowledge.write');
  const animal = scope ? ` for ${speciesPlural(scope)}` : '';
  const readable = useMemo(() => readableDocCount(knowledge.docs, scope), [knowledge.docs, scope]);

  function choose(next: KnowledgeMode) {
    if (next === mode) return;
    const sw = switchKnowledgeMode(draft, next);
    const touches =
      (sw.patch.focus_area !== undefined && (draft.focus_area ?? null) !== null) ||
      (sw.patch.knowledge_slugs !== undefined && (draft.knowledge_slugs?.length ?? 0) > 0);
    if (touches) ownPatch(sw.patch);
    setChosen(next);
    setNotice(sw.cleared ? { text: sw.cleared, undo: sw.undo } : null);
  }

  function undoSwitch() {
    if (!notice) return;
    ownPatch(notice.undo);
    setChosen(knowledgeModeOf({ ...draft, ...notice.undo }));
    setNotice(null);
  }

  function onUploaded(res: IngestResult, title: string) {
    const current = draftRef.current;
    const hadTopic = knowledgeModeOf(current) === 'focus' && current.focus_area;
    setRecent((r) => (r.includes(res.slug) ? r : [...r, res.slug]));
    ownPatch(attachSlugPatch(current, res.slug));
    setChosen('documents');
    setNotice(null);
    knowledge.refetch();
    const partial = (res.failures?.length ?? 0) > 0;
    const unsearchable = res.chunks === 0;
    toast({
      tone: partial || unsearchable ? 'info' : 'success',
      message: [
        `“${title}” is in the library and attached to this scenario.`,
        hadTopic ? `The topic “${focusAreaLabel(current.focus_area)}” was cleared.` : null,
        unsearchable
          ? 'It isn’t searchable yet — rebuild its search index in Knowledge.'
          : partial
            ? `${res.failures!.length} section${res.failures!.length === 1 ? '' : 's'} couldn’t be indexed; rebuild its search index in Knowledge.`
            : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  return (
    <StepBody>
      <Explainer title="How the AI uses knowledge">
        Once per conversation the AI pulls the few passages most relevant to this scenario. The
        customer <em>embodies</em> them — it never quotes them or mentions research — and the scorecard
        uses them as evidence when it explains what the trainee could have said. Trainees never see
        the documents themselves.
      </Explainer>

      <StudioSection title="Where should the AI look?">
        <Group label="Where should the AI look?">
          <FitGrid min={200}>
            {tiles.map((m) => (
              <OptionTile
                key={m.key}
                selected={mode === m.key}
                onSelect={() => choose(m.key)}
                disabled={!canWrite}
                glyph={<IconBadge icon={m.icon} size={34} />}
                title={m.title}
                description={m.description}
                footer={
                  m.recommended ? (
                    <span
                      style={{
                        justifySelf: 'start',
                        alignSelf: 'flex-start',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'oklch(0.40 0.14 145)',
                        background: COLOR.successSoft,
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      Recommended
                    </span>
                  ) : undefined
                }
              />
            ))}
          </FitGrid>
        </Group>

        {notice && (
          <InlineAlert tone="info">
            <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>{notice.text}</span>
              {canWrite && (
                <button type="button" style={linkButton} onClick={undoSwitch}>
                  Undo
                </button>
              )}
            </span>
          </InlineAlert>
        )}

        {knowledge.error && (
          canReadLibrary ? (
            <InlineAlert tone="warn" title="The knowledge library didn’t load">
              {knowledge.error} “Whole library” still works — the AI reads everything it’s allowed to.{' '}
              <button type="button" style={{ ...linkButton, color: 'inherit' }} onClick={knowledge.refetch}>
                Try again
              </button>
            </InlineAlert>
          ) : (
            <InlineAlert tone="info" title="You can’t browse the knowledge library">
              Your role doesn’t include the knowledge library, so documents and topic counts can’t be shown
              here. “Whole library” works without it — the AI still reads everything it’s allowed to.
            </InlineAlert>
          )
        )}

        {mode === 'library' && category && inherited.knowledge && (
          <CategoryKnowledgePanel
            name={category.name}
            focus={inherited.knowledge.focusArea}
            slugs={inherited.knowledge.knowledgeSlugs}
            docs={docsReady ? knowledge.docs : null}
            onEdit={canEditCategory ? () => setCategoryEditorOpen(true) : undefined}
          />
        )}

        {mode === 'library' && !categoryHasKnowledge && docsReady && (
          <Caption>
            Right now that’s {readable} searchable document{readable === 1 ? '' : 's'}
            {animal}.
          </Caption>
        )}

        {mode === 'library' && category && !categoryHasKnowledge && (
          <InlineAlert tone="info" title={`${category.name} has no knowledge attached yet`}>
            Attach documents to the category and every scenario in it — this one included — reads them.
            {canEditCategory && (
              <div style={{ marginTop: 8 }}>
                <Button size="sm" tone="secondary" onClick={() => setCategoryEditorOpen(true)}>
                  Add documents to {category.name}
                </Button>
              </div>
            )}
          </InlineAlert>
        )}

        {mode !== 'library' && category && categoryHasKnowledge && (
          <Caption>
            This replaces {knowledgeOf(category.name)} for this scenario only. Pick “Use{' '}
            {knowledgeOf(category.name)}” to go back.
          </Caption>
        )}

        {mode === 'focus' && (
          <TopicPicker
            focus={focus}
            counts={docsReady ? counts : null}
            canWrite={canWrite}
            onPick={(key) => ownPatch({ focus_area: key, knowledge_slugs: null })}
            animal={animal}
          />
        )}

        {mode === 'documents' && (
          <>
            {focus && (
              <InlineAlert tone="info">
                A topic (“{focusAreaLabel(focus)}”) is also saved, but it’s ignored while documents are
                attached.{' '}
                {canWrite && (
                  <button type="button" style={{ ...linkButton, color: 'inherit' }} onClick={() => ownPatch({ focus_area: null })}>
                    Clear it
                  </button>
                )}
              </InlineAlert>
            )}
            {selected.length === 0 && (
              <Caption>
                Nothing is ticked yet — until you tick a document, the AI searches the whole library.
              </Caption>
            )}
            {knowledge.error ? (
              selected.length > 0 && (
                <Caption>
                  {selected.length} document{selected.length === 1 ? ' is' : 's are'} attached. They’ll
                  show here once the library loads.
                </Caption>
              )
            ) : (
              <DocumentPicker
                docs={knowledge.docs}
                loading={knowledge.loading}
                selected={selected}
                missing={missing}
                scope={scope}
                canWrite={canWrite}
                canUpload={canUpload}
                onChange={(next) => ownPatch({ knowledge_slugs: next })}
              />
            )}
          </>
        )}
      </StudioSection>

      {canWrite && (
        <StudioSection title="Add your own document" optional>
          {canUpload ? (
            <div
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '16px 18px',
                borderRadius: 16,
                border: '1.5px dashed rgba(60,20,15,0.16)',
                background: 'rgba(255,255,255,0.5)',
              }}
            >
              <span style={{ flex: '1 1 260px', fontSize: 13, lineHeight: 1.55, color: COLOR.inkSoft }}>
                A PDF or pasted text. The assistant reads it and suggests how to file it; it’s then added to
                the library and attached to this scenario
                {category ? ` — or attach it to ${category.name} instead, so every scenario in it reads it` : ''}.
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  tone="secondary"
                  onClick={() => setUploadOpen(true)}
                  disabled={selected.length >= KNOWLEDGE_CAP}
                  title={selected.length >= KNOWLEDGE_CAP ? `${KNOWLEDGE_CAP} documents are already attached` : undefined}
                >
                  ⤴ Upload for this scenario
                </Button>
                {canEditCategory && (
                  <Button tone="ghost" onClick={() => setCategoryEditorOpen(true)}>
                    Add documents to {category!.name}
                  </Button>
                )}
              </span>
            </div>
          ) : (
            <Explainer>
              Need a document that isn’t in the library? Ask someone with knowledge access to add it in
              Knowledge — then tick it here.
            </Explainer>
          )}
        </StudioSection>
      )}

      <StudioSection
        title="Preview what the AI will read"
        hint="Runs the same search a real conversation runs, for this draft, and shows the passages that come back."
      >
        <KnowledgePreview draft={draft} goTo={goTo} categoryName={category?.name ?? null} />
      </StudioSection>

      {/* Portalled: the Studio shell may animate its step container, and a
          transformed ancestor would pin this fixed-position dialog to it. */}
      {canUpload &&
        typeof document !== 'undefined' &&
        createPortal(
          <KnowledgeUpload
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            draft={draft}
            atCap={selected.length >= KNOWLEDGE_CAP}
            onAdded={onUploaded}
          />,
          document.body,
        )}
      {canEditCategory &&
        typeof document !== 'undefined' &&
        createPortal(
          <CategoryEditor
            open={categoryEditorOpen}
            onClose={() => setCategoryEditorOpen(false)}
            category={category}
            canWrite={canWrite}
            knowledge={knowledge}
          />,
          document.body,
        )}
    </StepBody>
  );
}

/** "Uses <Category>'s knowledge": what the category gives, document by document. */
function CategoryKnowledgePanel({
  name,
  focus,
  slugs,
  docs,
  onEdit,
}: {
  name: string;
  focus: string | null;
  slugs: string[];
  /** The library (null while unknown) — to name each document. */
  docs: readonly { slug: string; title: string; chunk_count: number }[] | null;
  onEdit?: () => void;
}) {
  const bySlug = new Map((docs ?? []).map((d) => [d.slug, d] as const));
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 16,
        border: `1px solid ${COLOR.border}`,
        background: 'rgba(255,255,255,0.7)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <IconBadge icon={FolderOpen} size={26} />
        <span style={{ flex: '1 1 200px', fontSize: 13.5, fontWeight: 750, color: COLOR.ink }}>
          Uses {knowledgeOf(name)}
        </span>
        {onEdit && (
          <button type="button" style={linkButton} onClick={onEdit}>
            Edit {name}
          </button>
        )}
      </div>
      {slugs.length > 0 && (
        <ul aria-label={`Documents attached to ${name}`} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
          {slugs.map((slug) => {
            const doc = bySlug.get(slug);
            return (
              <li key={slug} style={{ fontSize: 13, color: COLOR.inkSoft, overflowWrap: 'anywhere' }}>
                {doc ? doc.title : docs ? <em>Missing from the library ({slug})</em> : slug}
                {doc && doc.chunk_count === 0 ? ' — not searchable yet' : ''}
              </li>
            );
          })}
        </ul>
      )}
      {focus && (
        <div style={{ fontSize: 12.5, color: COLOR.inkSoft }}>
          Topic: <strong style={{ color: COLOR.ink }}>{focusAreaLabel(focus)}</strong>
          {slugs.length > 0 ? ' — while documents are attached, the AI reads only those' : ''}
        </div>
      )}
      <Caption>Change it once on the category and every scenario in {name} follows.</Caption>
    </div>
  );
}

function TopicPicker({
  focus,
  counts,
  canWrite,
  onPick,
  animal,
}: {
  focus: string | null;
  /** Readable documents per topic, or null while the library is unknown. */
  counts: Map<string, number> | null;
  canWrite: boolean;
  onPick: (key: string) => void;
  animal: string;
}) {
  const current = FOCUS_AREAS.find((f) => f.key === focus) ?? null;
  const empty = focus !== null && counts !== null && (counts.get(focus) ?? 0) === 0;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Group label="Topic">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FOCUS_AREAS.map((f) => {
            const n = counts?.get(f.key);
            return (
              <Chip
                key={f.key}
                title={f.description}
                selected={focus === f.key}
                disabled={!canWrite}
                onClick={() => onPick(f.key)}
              >
                {f.label}
                {n !== undefined && (
                  <>
                    {' '}
                    <span style={{ marginLeft: 2, opacity: 0.7, fontWeight: 600 }}>· {n}</span>
                  </>
                )}
              </Chip>
            );
          })}
        </div>
      </Group>
      {current ? (
        <Caption>{current.description}</Caption>
      ) : (
        <Caption>Pick a topic — until you do, the AI searches the whole library.</Caption>
      )}
      {counts && !empty && current && (
        <Caption>
          {counts.get(current.key)} searchable document{counts.get(current.key) === 1 ? '' : 's'}
          {animal} filed under this topic.
        </Caption>
      )}
      {empty && (
        <InlineAlert tone="warn" title="Nothing is filed under this topic yet">
          No document the AI customer can read{animal} carries this topic, so the search falls back to the
          whole library and this scenario isn’t actually narrowed. File a document under it in Knowledge,
          or attach specific documents instead.
        </InlineAlert>
      )}
    </div>
  );
}
