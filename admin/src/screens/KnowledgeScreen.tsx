/**
 * KnowledgeScreen — the admin's library of source material for the AI.
 *
 * Written for the person who uploads documents, not for the person who wrote
 * the search pipeline: types and sources read as words ("Clinical reference",
 * "Built-in"), focus areas come from the shared vocabulary that scenarios
 * filter on, and the one technical operation left on this screen (making a
 * document searchable) is labelled in plain language.
 *
 * Built-in knowledge is no longer loaded from a button here — the deploy seeds
 * it. What remains is a status strip that says whether that happened.
 *
 * The two modals answer two questions and nothing else: "what this is" (type,
 * focus area, citation) and "who can use it" (tools × species, summarised as a
 * sentence). The document text is folded away behind a disclosure so both fit
 * on a 1280×800 screen without scrolling, and every explanation is an inline
 * line rather than a "?" someone has to find.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Glass } from '../primitives/Glass';
import {
  Collapsible,
  EmptyState,
  InfoTip,
  Kpi,
  LoadingShimmer,
  Modal,
  ModalCloseButton,
  StatusPill,
} from '../primitives';
import { FirstRunCard } from '../primitives/FirstRunCard';
import { InlineAlert } from '../primitives/form';
import { ReadOnlyBanner, useCan } from '../primitives/access';
import { useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { QueryBoundary } from '../primitives/QueryBoundary';
import {
  deleteKnowledge,
  ingestKnowledge,
  reembedKnowledge,
  useAdminSimulationConfig,
  useKnowledgeDocuments,
  useScenarioOverrides,
  type IngestResult,
} from '../data/queries';
import {
  UPLOAD_CATEGORIES,
  deleteConsequences,
  docCitation,
  fetchDeletedKnowledge,
  filterKnowledgeDocs,
  isBuiltIn,
  resolveDocFocus,
  resolveDocScope,
  restoreKnowledgeDocument,
  scenariosUsingDoc,
  scopeSpeciesSummary,
  scopeToolsSummary,
  sourceLabel,
  updateKnowledgeDocument,
  type DeletedKnowledgeDocument,
} from '../data/knowledgeActions';
import { KnowledgeSearchCard } from './KnowledgeSearchCard';
import {
  ASSISTANT_MIN_CHARS,
  KnowledgeAssistantPanel,
  Sparkle,
  SuggestedFieldFrame,
  SuggestedTag,
  readAutoSuggest,
  sanitizeSuggestion,
  useKnowledgeAssistant,
  useSuggestedFields,
  writeAutoSuggest,
  type SuggestedKey,
} from './KnowledgeAssistantPanel';
import { LIBRARY_MANIFEST } from '../data/scenarioManifest';
import { FOCUS_AREAS } from '../../../src/shared/knowledge/focusAreas';
import {
  ALL_KNOWLEDGE_SPECIES,
  DEFAULT_KNOWLEDGE_TOOLS,
  KNOWLEDGE_SPECIES,
  KNOWLEDGE_SPECIES_KEYS,
  KNOWLEDGE_TOOLS,
  KNOWLEDGE_TOOL_KEYS,
  knowledgeToolLabel,
} from '../../../src/shared/knowledge/knowledgeScopes';
import type { KnowledgeDocument } from '../data/types';
import { FOCUS_AREA_LABELS, KNOWLEDGE_CATEGORY_LABELS, labelOf } from '../lib/labels';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { btnPrimary, btnSecondary, inputStyle, textareaStyle } from './FlagsScreen';

const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4MB
const PREVIEW_CHARS = 4000;
const GRID = '1.5fr 120px 130px 130px 110px 90px 80px 90px';

/**
 * Toggle a key in a scope list, keeping the vocabulary's own order.
 *
 * Order matters beyond tidiness: the list is what gets written to the tag bag
 * and compared for dirtiness, so a click-order-dependent array would make
 * every re-tick look like an edit.
 */
function toggleScopeKey(current: string[], key: string, vocabulary: readonly string[]): string[] {
  const next = current.includes(key)
    ? current.filter((k) => k !== key)
    : [...current, key];
  return vocabulary.filter((k) => next.includes(k));
}

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((k, i) => k === b[i]);

// ─── Small shared bits ──────────────────────────────────────────────────────

/** The shared plain-English name for a `knowledge_documents.category` value. */
function typeLabel(category: string): string {
  return labelOf(KNOWLEDGE_CATEGORY_LABELS, category);
}

function TypePill({ category }: { category: string }) {
  const tone: 'info' | 'success' | 'neutral' =
    category === 'clinical' ? 'info' : category === 'custom' ? 'success' : 'neutral';
  return (
    <StatusPill tone={tone} dot={false}>
      {typeLabel(category)}
    </StatusPill>
  );
}

/**
 * A document with no searchable sections is invisible to every scenario, so
 * this pill is shown wherever a document is listed — not just in the detail
 * modal the admin may never open.
 */
function NotSearchablePill() {
  return (
    <StatusPill tone="warn" dot={false}>
      Not searchable yet
    </StatusPill>
  );
}

function SourcePill({ source }: { source: string }) {
  const built = source === 'code-seed';
  return (
    <StatusPill tone={built ? 'neutral' : 'info'} dot={false}>
      {sourceLabel(source)}
    </StatusPill>
  );
}

function FocusChipButton({
  label,
  description,
  active,
  onClick,
  disabled,
}: {
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={description}
      style={{
        padding: '6px 12px',
        borderRadius: 9999,
        border: active ? 'none' : `1px solid ${COLOR.border}`,
        cursor: disabled ? 'default' : 'pointer',
        background: active ? COLOR.brand : 'rgba(255,255,255,0.6)',
        color: active ? '#fff' : COLOR.inkSoft,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'var(--pbt-font)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ─── Plain-English scope sentences ──────────────────────────────────────────
//
// The modals explain the scope in words rather than behind a "?" — a chip row
// tells you what is ticked, it doesn't tell you what that *means*. These
// builders turn the ticked keys into the sentence a non-technical reader can
// check against what they intended.

const TOOL_PHRASES: Record<string, string> = {
  roleplay: 'roleplay sessions',
  scoring: 'session scoring',
  coach: 'coach hints',
  'scenario-builder': 'the scenario builder',
  'fecal-scan': 'Fecal Scan',
};

const SPECIES_PHRASES: Record<string, string> = {
  dog: 'adult dogs',
  puppy: 'puppies',
  cat: 'cats',
};

/** "a", "a and b", "a, b and c" — an Oxford-free list people read out loud. */
function joinWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The line under the "Used by" chips: what the ticks mean, in plain words. */
export function toolsPhrase(tools: readonly string[]): string {
  if (tools.length === 0) return 'No tool can read this document.';
  return `Used in ${joinWords(tools.map((t) => TOOL_PHRASES[t] ?? t))}.`;
}

/** The line under the Species chips. */
export function speciesPhrase(species: readonly string[]): string {
  if (species.length === 0) return 'No animals picked.';
  if (species.length === KNOWLEDGE_SPECIES_KEYS.length) return 'Applies to every animal.';
  return `Applies to ${joinWords(species.map((s) => SPECIES_PHRASES[s] ?? s))} only.`;
}

/**
 * The live one-sentence summary both modals show. Reads as a claim the admin
 * can agree or disagree with — "This document is used by Fecal Scan, for adult
 * dogs only." — which is a far better check than two rows of ticked chips.
 */
export function scopeSummarySentence(
  tools: readonly string[],
  species: readonly string[],
): string {
  if (tools.length === 0 || species.length === 0) return '';
  const toolPart = joinWords(tools.map((t) => knowledgeToolLabel(t) ?? t));
  const speciesPart =
    species.length === KNOWLEDGE_SPECIES_KEYS.length
      ? 'for every animal.'
      : `for ${joinWords(species.map((s) => SPECIES_PHRASES[s] ?? s))} only.`;
  return `This document is used by ${toolPart}, ${speciesPart}`;
}

/** Word count for the content disclosure label. */
function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

const FOCUS_HELP = (
  <>
    <p style={{ margin: '0 0 10px' }}>
      A focus area is the clinical topic a document belongs to. Scenarios can be
      set to the same focus area — when they are, they only pull from documents
      tagged that way, so a weight-management roleplay isn't quoting a urinary
      paper.
    </p>
    <p style={{ margin: 0 }}>
      Leave it blank to make the document available to every scenario that
      doesn't restrict itself.
    </p>
  </>
);

/**
 * What "Used by" means, in the words of the people who will read it. The last
 * paragraph is the whole point of the feature: the scope is a hard wall, not a
 * preference, and the fecal example is the one that makes that concrete.
 */
const TOOLS_HELP = (
  <>
    <p style={{ margin: '0 0 10px' }}>
      “Used by” is the list of tools allowed to read this document. Nothing else
      can see it, whatever it is about:
    </p>
    <ul style={{ margin: '0 0 10px', paddingLeft: 18, display: 'grid', gap: 4 }}>
      {KNOWLEDGE_TOOLS.map((t) => (
        <li key={t.key}>
          <strong>{t.label}</strong> — {t.description}
        </li>
      ))}
    </ul>
    <p style={{ margin: 0 }}>
      New documents are used by the four training tools and not by Fecal Scan —
      that one has to be ticked on purpose. Fecal Scan only sees documents filed
      under Fecal Scan, and only for the species ticked: a cat document can never
      reach a dog scan.
    </p>
  </>
);

const SPECIES_HELP = (
  <>
    <p style={{ margin: '0 0 10px' }}>
      Which animals this document applies to. A document filed under
      <strong> Adult dog</strong> only ever comes back for a dog request — a cat
      scan cannot see it, and never will.
    </p>
    <p style={{ margin: 0 }}>
      Leave all three ticked for anything that isn’t species-specific; that is
      what a new document starts as.
    </p>
  </>
);

/**
 * A row of multi-select scope chips with at-least-one enforcement handled by
 * the caller (the caller is the one that owns the save button the rule blocks).
 */
function ScopeChips({
  testId,
  options,
  selected,
  vocabulary,
  onChange,
}: {
  testId: string;
  options: Array<{ key: string; label: string; description: string }>;
  selected: string[];
  vocabulary: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <FocusChipButton
          key={o.key}
          label={o.label}
          description={o.description}
          active={selected.includes(o.key)}
          onClick={() => onChange(toggleScopeKey(selected, o.key, vocabulary))}
        />
      ))}
    </div>
  );
}

// ─── Modal layout vocabulary ────────────────────────────────────────────────
//
// Both modals are built from the same three pieces: a titled card with a
// one-line explanation, a mono field label, and a small muted hint. Nothing in
// a modal hides behind a "?" any more — the explanation is the line under the
// heading, where it is read without a click.

/** A titled panel inside a modal: plain-English heading + one-line "why". */
function ModalSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  /** Sits on the heading row — a control that belongs to the section itself. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: 'grid',
        gap: 14,
        alignContent: 'start',
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${COLOR.border}`,
        background: 'rgba(255,255,255,0.55)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: COLOR.ink }}>{title}</h3>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.45, color: COLOR.inkMute }}>
            {hint}
          </p>
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A numbered step in the add flow. Same card as `ModalSection`; the number is
 * doing the explaining, so there is no second line of prose to read.
 */
function StepSection({
  step,
  title,
  action,
  children,
}: {
  step: number;
  title: string;
  /** Sits on the heading row — a control that belongs to the step itself. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: 'grid',
        gap: 10,
        alignContent: 'start',
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${COLOR.border}`,
        background: 'rgba(255,255,255,0.55)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: COLOR.ink }}>
          {`${step} · ${title}`}
        </h3>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * The mono eyebrow above a field or a chip row. `suggested` hangs the
 * "Suggested by the assistant" tag off the right of it — the tag belongs to
 * the label, not the control, so it reads the same over an input and a chip row.
 */
function FieldLabel({ children, suggested }: { children: ReactNode; suggested?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        color: COLOR.inkMute,
        fontFamily: 'var(--pbt-mono)',
        marginBottom: 6,
      }}
    >
      <span>{children}</span>
      {suggested && <SuggestedTag />}
    </div>
  );
}

/** A muted one-liner under a control — what it does, or what is selected. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.45, color: COLOR.inkMute, marginTop: 6 }}>
      {children}
    </div>
  );
}

/**
 * The document text, folded away.
 *
 * The preview was the single tallest thing in the old modal and the thing
 * people needed least, so it costs one line until it is asked for — and when
 * it opens, only this box scrolls.
 */
function ContentDisclosure({
  content,
  truncatedNote,
  action,
}: {
  content: string;
  truncatedNote?: string;
  /** Rendered on the right of the header — the Rebuild control and its line. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const words = wordCount(content);
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${COLOR.border}`, background: 'rgba(255,255,255,0.5)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            ...btnSecondary,
            padding: '5px 11px',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <span aria-hidden style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>
            ▶
          </span>
          {open
            ? 'Hide the text'
            : `Show the text (${words.toLocaleString()} word${words === 1 ? '' : 's'})`}
        </button>
        {action}
      </div>
      {open && (
        <div
          data-testid="doc-content"
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            margin: '0 12px 12px',
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${COLOR.border}`,
            background: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11.5,
            lineHeight: 1.65,
            color: COLOR.inkSoft,
            whiteSpace: 'pre-wrap',
          }}
        >
          {content || '(empty)'}
          {truncatedNote && (
            <div style={{ marginTop: 10, fontFamily: 'var(--pbt-font)', color: COLOR.inkMute }}>
              {truncatedNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export function KnowledgeScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const docs = useKnowledgeDocuments(refreshKey);
  const overrides = useScenarioOverrides();
  const simulation = useAdminSimulationConfig();
  const toast = useToast();
  const can = useCan();
  const canWrite = can('knowledge.write');
  const canRead = can('knowledge.read');
  const [adding, setAdding] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [focusFilter, setFocusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [toolFilter, setToolFilter] = useState('all');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  /** Failure lines from the last bulk run, listed under the action bar. */
  const [bulkFailures, setBulkFailures] = useState<{ title: string; lines: string[] } | null>(
    null,
  );

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  /** Undo a soft delete straight from the toast that announced it. */
  async function undoDelete(slug: string, title: string) {
    try {
      await restoreKnowledgeDocument(slug);
      refresh();
      toast({ message: `“${title}” restored.`, tone: 'success' });
    } catch (err) {
      toast({
        message: `Couldn’t restore “${title}” — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
    }
  }

  function handleDeleted(res: { slug: string; title: string; pruned: string[] }) {
    setOpenSlug(null);
    refresh();
    toast({
      message: `“${res.title}” moved to Recently deleted.`,
      tone: 'success',
      action: { label: 'Undo', onClick: () => void undoDelete(res.slug, res.title) },
    });
    if (res.pruned.length > 0) {
      toast({
        message: `Also detached from ${res.pruned.length} scenario${res.pruned.length === 1 ? '' : 's'}: ${res.pruned
          .map(scenarioTitle)
          .join(', ')}. Restoring the document does not re-attach them.`,
        tone: 'info',
      });
    }
  }

  const stats = useMemo(() => {
    const d = docs.data;
    return {
      total: d.length,
      chunks: d.reduce((s, doc) => s + (doc.chunk_count ?? 0), 0),
      cited: d.filter((doc) => docCitation(doc.metadata) !== null).length,
      uploaded: d.filter((doc) => !isBuiltIn(doc)).length,
      unsearchable: d.filter((doc) => (doc.chunk_count ?? 0) === 0).length,
    };
  }, [docs.data]);

  /*
    The global switch in Library → Simulation turns supporting research off for
    every scenario. With it off nothing here reaches a roleplay, so the library
    must say so rather than keep promising that scenarios can quote from it.
  */
  const researchOff =
    (simulation.data.config.rag as { enabled?: boolean } | undefined)?.enabled === false;

  const filtered = useMemo(
    () =>
      filterKnowledgeDocs(docs.data, {
        query,
        focus: focusFilter,
        category: typeFilter,
        tool: toolFilter,
        species: speciesFilter,
      }),
    [docs.data, query, focusFilter, typeFilter, toolFilter, speciesFilter],
  );

  // Present focus filters that actually match something, so the row doesn't
  // advertise buckets this library has nothing in.
  const focusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of docs.data) {
      const key = resolveDocFocus(doc.metadata) ?? 'none';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [docs.data]);

  const typeKeys = useMemo(() => {
    const seen = new Set(docs.data.map((d) => d.category));
    return [...seen].sort();
  }, [docs.data]);

  // Scope counts are containment counts, not a partition: a document filed
  // under three species is counted under all three, which is exactly what the
  // filter will do with it.
  const scopeCounts = useMemo(() => {
    const tools = new Map<string, number>();
    const species = new Map<string, number>();
    for (const doc of docs.data) {
      const scope = resolveDocScope(doc.metadata);
      for (const t of scope.tools) tools.set(t, (tools.get(t) ?? 0) + 1);
      for (const s of scope.species) species.set(s, (species.get(s) ?? 0) + 1);
    }
    return { tools, species };
  }, [docs.data]);

  const openDoc = openSlug ? docs.data.find((d) => d.slug === openSlug) ?? null : null;

  /*
    Built-in knowledge is re-seeded by the deploy, not by a button on this
    screen. What the admin still needs is proof that it happened — a count and
    a timestamp — and a straight answer when it hasn't.
  */
  const builtInSeed = useMemo(() => {
    const seeds = docs.data.filter((d) => d.source === 'code-seed');
    const latest = seeds.reduce(
      (max, d) => Math.max(max, new Date(d.updated_at).getTime()),
      0,
    );
    return { count: seeds.length, latest };
  }, [docs.data]);

  const builtInMissing = builtInSeed.count === 0;
  const builtInStatus = builtInMissing
    ? 'Built-in knowledge hasn’t loaded yet — it loads on the next deploy'
    : `Built-in knowledge loads automatically · ${builtInSeed.count} built-in document${
        builtInSeed.count === 1 ? '' : 's'
      } · last updated ${fmtAgo(builtInSeed.latest)}`;

  return (
    <>
      <ContextBar
        title="Knowledge"
        subtitle="The source material your scenarios can quote from. Upload a study, file it under a focus area, and scenarios set to that area will use it."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="knowledge.write" />
        <FirstRunCard id="knowledge" title="What this library is for">
          Everything here is source material the AI can draw on during a roleplay:
          file a document under a <strong>focus area</strong> and every scenario set
          to that area starts its sessions with the most relevant sections of it. For
          tighter control, attach specific documents to a scenario in{' '}
          <strong>Library → Builder</strong> — attachments win, and the focus filter
          is then ignored.
          <br />
          <br />
          Two columns decide who can see a document at all. <strong>Used by</strong>{' '}
          lists the tools allowed to read it — new documents are used by the four
          training tools, and <strong>Fecal Scan</strong> has to be ticked on purpose.{' '}
          <strong>Species</strong> says which animals it applies to. Both are hard
          limits that are never relaxed: a cat document can never reach a dog scan.
          Use <strong>Try a search</strong> below to see exactly what any tool would
          get back.
        </FirstRunCard>
        {researchOff && (
          <InlineAlert tone="warn" title="Scenarios aren’t using this library right now">
            Supporting research is switched off for every scenario, so nothing here
            reaches a roleplay — the AI answers from its own general knowledge.
            Turn it back on in <strong>Library → Simulation → Global</strong>.
          </InlineAlert>
        )}
        {/*
          Blocking. With no document list the KPIs read "0 documents", the
          filters offer nothing, and the empty table would read as "no
          documents" — a different and much more alarming thing than a failed
          request. Retry goes through refresh() so the deleted drawer reloads too.
        */}
        <QueryBoundary
          query={{ loading: docs.loading, error: docs.error, refetch: refresh }}
          title="Couldn’t load the knowledge library"
          showLoading={false}
        >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {docs.loading ? (
            Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
          ) : (
            <>
              <Kpi label="Documents" value={stats.total} icon="⌆" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
              <Kpi label="Searchable sections" value={stats.chunks} icon="▤" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
              <Kpi label="Cited studies" value={stats.cited} icon="✦" accent={COLOR.successSoft} sparkColor={COLOR.success} />
              <Kpi label="Uploaded docs" value={stats.uploaded} icon="✎" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
            </>
          )}
        </div>

        <Glass padding={16} radius={20}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {/*
              A status strip, not a button. Loading the built-in set is the
              deploy's job now, so the only useful thing this bar can say is
              whether it happened and when.
            */}
            <span
              data-testid="builtin-status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 13px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.35,
                background: builtInMissing ? COLOR.warnSoft : 'rgba(255,255,255,0.6)',
                border: `1px solid ${builtInMissing ? 'color-mix(in oklab, oklch(0.62 0.18 70) 26%, transparent)' : COLOR.border}`,
                color: builtInMissing ? 'oklch(0.42 0.14 70)' : COLOR.inkSoft,
              }}
            >
              {builtInStatus}
            </span>
            {canWrite && (
              <span style={{ marginLeft: 'auto' }}>
                <button style={btnPrimary} onClick={() => setAdding(true)}>
                  + Add document
                </button>
              </span>
            )}
          </div>
          {bulkFailures && (
            <InlineAlert tone="warn" title={bulkFailures.title} style={{ marginTop: 12 }}>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>
                {bulkFailures.lines.map((line) => (
                  <li key={line} style={{ fontFamily: 'var(--pbt-mono)', fontSize: 11.5 }}>
                    {line}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>
                These sections are saved but not searchable — open the document
                and press “Rebuild search index”.
              </div>
            </InlineAlert>
          )}
        </Glass>

        {/*
          Reading permission only: the tester runs a search, it changes nothing.
          It sits directly under the bulk bar because it is the answer to the
          question the rest of this screen raises — "is this document actually
          reachable?" — and that question comes up before the filters do.
        */}
        {canRead && <KnowledgeSearchCard />}

        <Glass padding={16} radius={20}>
          <div style={{ display: 'grid', gap: 10 }}>
            <FilterRow
              label="Focus area"
              options={[
                { key: 'all', label: `All (${docs.data.length})` },
                ...FOCUS_AREAS.filter((f) => focusCounts.has(f.key)).map((f) => ({
                  key: f.key,
                  label: `${f.label} (${focusCounts.get(f.key)})`,
                  description: f.description,
                })),
                ...(focusCounts.has('none')
                  ? [{ key: 'none', label: `Not filed (${focusCounts.get('none')})` }]
                  : []),
              ]}
              value={focusFilter}
              onChange={setFocusFilter}
              info={{ title: 'Focus area', body: FOCUS_HELP }}
            />
            <FilterRow
              label="Used by"
              options={[
                { key: 'all', label: `All (${docs.data.length})` },
                ...KNOWLEDGE_TOOLS.filter((t) => scopeCounts.tools.has(t.key)).map((t) => ({
                  key: t.key,
                  label: `${t.label} (${scopeCounts.tools.get(t.key)})`,
                  description: t.description,
                })),
              ]}
              value={toolFilter}
              onChange={setToolFilter}
              info={{ title: 'Used by', body: TOOLS_HELP }}
            />
            <FilterRow
              label="Species"
              options={[
                { key: 'all', label: `All (${docs.data.length})` },
                ...KNOWLEDGE_SPECIES.filter((s) => scopeCounts.species.has(s.key)).map((s) => ({
                  key: s.key,
                  label: `${s.label} (${scopeCounts.species.get(s.key)})`,
                  description: s.description,
                })),
              ]}
              value={speciesFilter}
              onChange={setSpeciesFilter}
              info={{ title: 'Species', body: SPECIES_HELP }}
            />
            {typeKeys.length > 1 && (
              <FilterRow
                label="Type"
                options={[
                  { key: 'all', label: 'All' },
                  ...typeKeys.map((k) => ({ key: k, label: typeLabel(k) })),
                ]}
                value={typeFilter}
                onChange={setTypeFilter}
              />
            )}
          </div>
        </Glass>

        {stats.unsearchable > 0 && (
          <InlineAlert
            tone="warn"
            title={`${stats.unsearchable} document${stats.unsearchable === 1 ? '' : 's'} can’t be used yet`}
          >
            They are saved, but none of their text was made searchable, so no
            scenario can pull from them. Open each one and press “Rebuild search
            index” — the rows are marked “Not searchable yet” in the list below.
          </InlineAlert>
        )}

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Title', 'Type', 'Focus area', 'Used by', 'Species', 'Source', 'Updated', ''].map((h, i) => (
              <div
                key={h || `col-${i}`}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: COLOR.inkMute,
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {filtered.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onOpen={() => setOpenSlug(doc.slug)} />
          ))}
          {!docs.loading && filtered.length === 0 && (
            <EmptyState
              title={docs.data.length === 0 ? 'No documents yet' : 'Nothing matches those filters'}
              subtitle={
                docs.data.length === 0
                  ? 'The built-in knowledge loads on the next deploy. Add your own studies any time with “+ Add document”.'
                  : 'Clear the search box or pick a different focus area.'
              }
            />
          )}
        </Glass>

        <RecentlyDeleted
          refreshKey={refreshKey}
          canWrite={canWrite}
          onRestored={(title) => {
            refresh();
            toast({ message: `“${title}” restored to the library.`, tone: 'success' });
          }}
          onError={(message) => toast({ message, tone: 'error' })}
        />
        </QueryBoundary>
      </ScreenShell>

      <AddDocumentModal
        open={adding}
        onClose={() => setAdding(false)}
        onIngested={(res) => {
          setAdding(false);
          refresh();
          const failures = res.failures ?? [];
          if (failures.length > 0) {
            toast({
              message: `Added, but ${failures.length} section${failures.length === 1 ? '' : 's'} couldn’t be made searchable — open the document and rebuild its search index.`,
              tone: 'info',
            });
            setBulkFailures({ title: 'Sections that could not be made searchable', lines: failures });
          } else {
            toast({
              message: `Document added — searchable in ${res.chunks} section${res.chunks === 1 ? '' : 's'}.`,
              tone: 'success',
            });
          }
        }}
      />

      <DocumentModal
        doc={openDoc}
        overrides={overrides.data}
        overridesError={overrides.error}
        canWrite={canWrite}
        onClose={() => setOpenSlug(null)}
        onChanged={refresh}
        onDeleted={handleDeleted}
        onToast={toast}
      />
    </>
  );
}

// ─── Recently deleted ───────────────────────────────────────────────────────

/**
 * Soft-deleted documents, newest first. This drawer is what makes "Delete"
 * honest: the server tombstones rather than destroys, so the only thing that
 * made a delete feel irreversible was having nowhere to see the tombstones.
 */
function RecentlyDeleted({
  refreshKey,
  canWrite,
  onRestored,
  onError,
}: {
  refreshKey: number;
  canWrite: boolean;
  onRestored: (title: string) => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<DeletedKnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDeletedKnowledge()
      .then((docs) => {
        if (!cancelled) {
          setRows(docs);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function restore(row: DeletedKnowledgeDocument) {
    setBusySlug(row.slug);
    try {
      await restoreKnowledgeDocument(row.slug);
      setRows((prev) => prev.filter((r) => r.slug !== row.slug));
      onRestored(row.title);
    } catch (err) {
      onError(
        `Couldn’t restore “${row.title}” — ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      setBusySlug(null);
    }
  }

  // Nothing deleted and nothing broken: stay out of the way entirely.
  if (loading || (!error && rows.length === 0)) return null;

  return (
    <Glass padding={16} radius={20}>
      <Collapsible title={`Recently deleted${rows.length ? ` (${rows.length})` : ''}`}>
        {error ? (
          <InlineAlert tone="warn">Couldn’t load deleted documents: {error}</InlineAlert>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: COLOR.inkMute }}>
              Deleted documents are hidden from scenarios but not destroyed. Restoring
              brings a document back — it does <strong>not</strong> re-attach it to the
              scenarios it was detached from.
            </div>
            {rows.map((row) => (
              <div
                key={row.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.55)',
                  border: '0.5px solid rgba(255,255,255,0.9)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                    {row.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-mono)',
                      fontSize: 11,
                      color: COLOR.inkMute,
                      marginTop: 2,
                    }}
                  >
                    {typeLabel(row.category)} · deleted{' '}
                    {fmtAgo(new Date(row.deleted_at).getTime())}
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={() => void restore(row)}
                    disabled={busySlug === row.slug}
                    style={{ ...btnSecondary, opacity: busySlug === row.slug ? 0.6 : 1 }}
                  >
                    {busySlug === row.slug ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible>
    </Glass>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
  info,
}: {
  label: string;
  options: Array<{ key: string; label: string; description?: string }>;
  value: string;
  onChange: (key: string) => void;
  info?: { title: string; body: ReactNode };
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          fontFamily: 'var(--pbt-mono)',
          minWidth: 78,
        }}
      >
        {label}
      </span>
      {options.map((o) => (
        <FocusChipButton
          key={o.key}
          label={o.label}
          description={o.description}
          active={value === o.key}
          onClick={() => onChange(o.key)}
        />
      ))}
      {info && <InfoTip title={info.title}>{info.body}</InfoTip>}
    </div>
  );
}

function DocumentRow({ doc, onOpen }: { doc: KnowledgeDocument; onOpen: () => void }) {
  const focus = resolveDocFocus(doc.metadata);
  const scope = resolveDocScope(doc.metadata);
  const citation = docCitation(doc.metadata);
  const searchable = (doc.chunk_count ?? 0) > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`doc-row-${doc.slug}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        padding: '12px 22px',
        gap: 12,
        alignItems: 'center',
        borderBottom: '0.5px solid rgba(60,20,15,0.04)',
        cursor: 'pointer',
        textAlign: 'left',
        // A document with nothing searchable is dead weight; tint the whole row
        // so it can't be mistaken for a working one at a glance.
        background: searchable ? undefined : COLOR.warnSoft,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{doc.title}</div>
        {!searchable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <NotSearchablePill />
            <span style={{ fontSize: 11, color: COLOR.inkSoft }}>
              no scenario can pull from it — open it and rebuild the search index
            </span>
          </div>
        )}
        {citation && (
          <div
            style={{
              fontSize: 11,
              color: COLOR.inkMute,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {citation}
          </div>
        )}
      </div>
      <TypePill category={doc.category} />
      <div style={{ fontSize: 12, color: focus ? COLOR.ink : COLOR.inkMute, fontWeight: 600 }}>
        {focus ? (
          <StatusPill tone="info" dot={false}>
            {labelOf(FOCUS_AREA_LABELS, focus)}
          </StatusPill>
        ) : (
          '—'
        )}
      </div>
      {/* Scope, the two hard walls: who may read it, and for which animals. */}
      <div>
        <StatusPill tone={scope.tools.includes('fecal-scan') ? 'info' : 'neutral'} dot={false}>
          {scopeToolsSummary(scope.tools)}
        </StatusPill>
      </div>
      <div>
        <StatusPill tone="neutral" dot={false}>
          {scopeSpeciesSummary(scope.species)}
        </StatusPill>
      </div>
      <SourcePill source={doc.source} />
      <div style={{ fontSize: 11, color: COLOR.inkMute }}>
        {fmtAgo(new Date(doc.updated_at).getTime())}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ ...btnSecondary, padding: '5px 12px', fontSize: 11.5 }}>Open</span>
      </div>
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────

function DocumentModal({
  doc,
  overrides,
  overridesError,
  canWrite,
  onClose,
  onChanged,
  onDeleted,
  onToast,
}: {
  doc: KnowledgeDocument | null;
  overrides: Array<{
    scenario_id: string;
    focus_area: string | null;
    knowledge_slugs: string[] | null;
  }>;
  /** Non-null when the scenario cross-read failed — usage is unknown, not empty. */
  overridesError: string | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (res: { slug: string; title: string; pruned: string[] }) => void;
  onToast: (opts: { message: string; tone?: 'success' | 'error' | 'info' }) => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('custom');
  const [focus, setFocus] = useState<string | null>(null);
  const [citation, setCitation] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [species, setSpecies] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'save' | 'index' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The tag assistant reads the STORED document (by slug) and proposes a
  // filing; Apply only edits these same fields, so "Save changes" stays the
  // one thing that writes.
  const assistant = useKnowledgeAssistant();
  const suggested = useSuggestedFields();

  // Seed the editor when a document is opened. Keyed on slug only, NOT on
  // updated_at: saving refreshes the list, and re-seeding from the refreshed
  // row would wipe the "Saved" confirmation the admin just earned.
  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setCategory(doc.category);
    setFocus(resolveDocFocus(doc.metadata));
    setCitation(docCitation(doc.metadata) ?? '');
    const scope = resolveDocScope(doc.metadata);
    setTools(scope.tools);
    setSpecies(scope.species);
    setError(null);
    setNote(null);
    assistant.reset();
    suggested.reset();
  }, [doc?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;

  function runAssistant() {
    if (!doc) return;
    void assistant.run({ slug: doc.slug });
  }

  /**
   * Copy the proposal into the fields. Built-ins keep their title and type
   * (the seed owns those); everything else is the admin's to change, so it
   * is theirs to overwrite with a suggestion too.
   */
  function applySuggestions() {
    if (!assistant.analysis) return;
    const s = sanitizeSuggestion(assistant.analysis, assistant.extractedCitation ?? undefined);
    const marks: SuggestedKey[] = ['focus', 'tools', 'species'];
    if (!isBuiltIn(doc!)) {
      if (s.title) {
        setTitle(s.title);
        marks.push('title');
      }
      setCategory(s.category);
      marks.push('category');
    }
    setFocus(s.focus);
    setTools(s.tools);
    setSpecies(s.species);
    if (s.citation) {
      setCitation(s.citation);
      marks.push('citation');
    }
    suggested.mark(marks);
    assistant.hide(true);
  }

  const builtIn = isBuiltIn(doc);
  const searchable = (doc.chunk_count ?? 0) > 0;
  const preview = doc.content.slice(0, PREVIEW_CHARS);
  const truncated = doc.content.length > PREVIEW_CHARS;
  const links = scenariosUsingDoc(doc, overrides, scenarioTitle);

  const savedScope = resolveDocScope(doc.metadata);
  const dirty =
    title.trim() !== doc.title ||
    category !== doc.category ||
    focus !== resolveDocFocus(doc.metadata) ||
    citation.trim() !== (docCitation(doc.metadata) ?? '') ||
    !sameKeys(tools, savedScope.tools) ||
    !sameKeys(species, savedScope.species);

  /*
    An empty scope is not a narrower document, it is an invisible one: nothing
    would ever retrieve it again and nothing on this screen would look wrong.
    So the save is blocked rather than the last chip being un-clickable — the
    admin sees what they did and reads why it can't be saved.
  */
  const scopeProblem =
    tools.length === 0
      ? 'Pick at least one tool — a document no tool is allowed to read can never be retrieved again.'
      : species.length === 0
        ? 'Pick at least one species — a document with no species can never be retrieved again.'
        : null;

  async function save() {
    if (!doc) return;
    setBusy('save');
    setError(null);
    setNote(null);
    try {
      const res = await updateKnowledgeDocument({
        slug: doc.slug,
        ...(builtIn ? {} : { title: title.trim(), category }),
        focus,
        citation: citation.trim() || null,
        // Scope is editable on built-ins too: where a document is allowed to
        // be read is the admin's decision, not the seed's.
        tools,
        species,
      });
      setNote(
        res.chunks_updated > 0
          ? `Saved — ${res.chunks_updated} section${res.chunks_updated === 1 ? '' : 's'} re-filed.`
          : 'Saved.',
      );
      const chunkFailures = res.chunk_failures ?? [];
      if (chunkFailures.length > 0) {
        // The document row saved but some sections kept their old tags, so a
        // focus-filtered scenario now sees a stale mix. Saving again retries.
        onToast({
          message: `Saved, but ${chunkFailures.length} section${chunkFailures.length === 1 ? '' : 's'} kept the old focus area — save again to retry.`,
          tone: 'info',
        });
      } else {
        onToast({ message: `“${title.trim() || doc.title}” saved.`, tone: 'success' });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function rebuild() {
    if (!doc) return;
    setBusy('index');
    setError(null);
    setNote(null);
    try {
      const res = await reembedKnowledge(doc.slug);
      setNote(`Search index rebuilt — this document is now searchable in ${res.chunks} sections.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rebuild failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!doc) return;
    const ok = await confirm({
      title: `Delete “${doc.title}”?`,
      body: builtIn
        ? 'This document ships with the app. While it sits in Recently deleted, the automatic knowledge sync leaves it deleted rather than bringing it back — restore it from Recently deleted instead.'
        : undefined,
      consequences: overridesError
        ? [
            'Which scenarios use this document could not be checked, so this list may be incomplete.',
            'Any scenario that attached it loses the attachment — restoring does not re-attach them.',
            'Recoverable from “Recently deleted” at the bottom of this screen.',
          ]
        : deleteConsequences(links),
      confirmLabel: 'Delete document',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    setError(null);
    try {
      const res = await deleteKnowledge(doc.slug);
      onDeleted({
        slug: doc.slug,
        title: doc.title,
        pruned: res.pruned_scenarios ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
      onToast({ message: `Delete failed — ${message}`, tone: 'error' });
      setBusy(null);
    }
  }

  /*
    Closing with unsaved edits routes through the same confirm ladder the
    delete uses. `onRequestClose` must answer synchronously, so it blocks the
    close, asks, and closes itself if the answer is yes.
  */
  function requestClose(): boolean | void {
    if (!dirty || busy !== null) return;
    void (async () => {
      const ok = await confirm({
        title: 'Discard your changes?',
        body: 'This document has edits that have not been saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (ok) onClose();
    })();
    return false;
  }

  function attemptClose() {
    if (requestClose() === false) return;
    onClose();
  }

  const summary = scopeSummarySentence(tools, species);
  const rebuildButton = canWrite ? (
    <button
      onClick={() => void rebuild()}
      disabled={busy !== null}
      style={{ ...btnSecondary, padding: '5px 11px', fontSize: 12, opacity: busy ? 0.6 : 1 }}
    >
      {busy === 'index' ? 'Rebuilding…' : 'Rebuild search index'}
    </button>
  ) : null;

  const saveLabel = busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'No changes';

  return (
    <Modal
      open
      onClose={onClose}
      onRequestClose={requestClose}
      width={1080}
      ariaLabel={doc.title}
    >
      {/*
        `overflowY: auto` is a safety valve, not the layout: collapsed, this
        panel fits at 1280×800 with room to spare. It only ever engages once
        the content disclosure is opened on a short screen.
      */}
      <div style={{ padding: '20px 24px 18px', display: 'grid', gap: 14, overflowY: 'auto' }}>
        {/* ── Header: what this document is, at a glance ── */}
        <div style={{ paddingRight: 44 }}>
          {builtIn ? (
            <h2
              style={{
                margin: 0,
                fontSize: 21,
                fontWeight: 800,
                color: COLOR.ink,
                letterSpacing: '-0.02em',
              }}
            >
              {doc.title}
            </h2>
          ) : (
            <SuggestedFieldFrame active={suggested.has('title')} flashKey={suggested.flashKey}>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  suggested.clear('title');
                }}
                aria-label="Document title"
                style={{
                  ...inputStyle,
                  padding: '4px 8px',
                  marginLeft: -8,
                  fontSize: 21,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  border: '1px solid transparent',
                  background: 'rgba(255,255,255,0.45)',
                }}
              />
              {suggested.has('title') && (
                <div style={{ marginTop: 4 }}>
                  <SuggestedTag />
                </div>
              )}
            </SuggestedFieldFrame>
          )}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <TypePill category={doc.category} />
            <SourcePill source={doc.source} />
            {searchable ? (
              <StatusPill tone="success" dot={false}>
                {`Searchable · ${doc.chunk_count} section${doc.chunk_count === 1 ? '' : 's'}`}
              </StatusPill>
            ) : (
              <StatusPill tone="warn" dot={false}>
                Not searchable
              </StatusPill>
            )}
            <span
              style={{ fontFamily: 'var(--pbt-mono)', fontSize: 10.5, color: COLOR.inkMute }}
              title="How this document is named behind the scenes — quote it to support."
            >
              {doc.slug}
            </span>
          </div>
          {builtIn && (
            <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 7 }}>
              This one ships with the app, so its title and type are set for you — the
              rest is yours to change.
            </div>
          )}
        </div>

        {/*
          The case that actually costs someone a session: saved, but invisible.
          It gets a banner of its own rather than a line inside a disclosure.
        */}
        {!searchable && (
          <InlineAlert tone="warn" title="Not searchable — no scenario can pull from this yet">
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 4,
              }}
            >
              <span style={{ flex: 1, minWidth: 260 }}>
                Its text was never split into sections. Rebuilding does that now — it
                takes a moment and changes nothing else.
              </span>
              {rebuildButton}
            </div>
          </InlineAlert>
        )}

        {/*
          The assistant's proposal, when there is one. It sits above the two
          questions because it answers both — and it is a proposal only:
          nothing below changes until Apply, nothing saves until Save.
        */}
        <KnowledgeAssistantPanel
          assistant={assistant}
          onRun={runAssistant}
          onApply={applySuggestions}
          source="document"
          idle="hidden"
        />

        {/* ── The two questions a document has to answer ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <ModalSection
            title="What this is"
            hint="How the document is filed. A scenario set to a focus area only pulls from documents filed under the same one."
          >
            <SuggestedFieldFrame active={suggested.has('category')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('category')}>Type</FieldLabel>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  suggested.clear('category');
                }}
                disabled={builtIn}
                aria-label="Type"
                style={{ ...inputStyle, opacity: builtIn ? 0.6 : 1 }}
              >
                {(builtIn
                  ? [{ value: doc.category, label: typeLabel(doc.category) }]
                  : UPLOAD_CATEGORIES
                ).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('focus')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('focus')}>Focus area</FieldLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <FocusChipButton
                  label="None"
                  active={focus === null}
                  onClick={() => {
                    setFocus(null);
                    suggested.clear('focus');
                  }}
                />
                {FOCUS_AREAS.map((f) => (
                  <FocusChipButton
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    active={focus === f.key}
                    onClick={() => {
                      setFocus(focus === f.key ? null : f.key);
                      suggested.clear('focus');
                    }}
                  />
                ))}
              </div>
              <Hint>
                {focus
                  ? FOCUS_AREAS.find((f) => f.key === focus)?.description
                  : 'Not filed — every scenario that doesn’t restrict itself can use it.'}
              </Hint>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('citation')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('citation')}>Citation</FieldLabel>
              <input
                value={citation}
                onChange={(e) => {
                  setCitation(e.target.value);
                  suggested.clear('citation');
                }}
                aria-label="Citation"
                placeholder="e.g. Davies et al., 2024 — Veterinary Record"
                style={inputStyle}
              />
              <Hint>Shown to the AI next to anything it quotes.</Hint>
            </SuggestedFieldFrame>
          </ModalSection>

          <ModalSection
            title="Who can use it"
            hint="Two hard limits. Anything not ticked here can never see this document."
            action={
              canWrite ? (
                <button
                  type="button"
                  className="pbt-btn"
                  onClick={runAssistant}
                  disabled={busy !== null || assistant.status === 'analyzing'}
                  style={{
                    ...btnSecondary,
                    padding: '5px 11px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: COLOR.brand,
                  }}
                >
                  <Sparkle size={12} />
                  {assistant.status === 'analyzing' ? 'Reading…' : 'Suggest with AI'}
                </button>
              ) : undefined
            }
          >
            <SuggestedFieldFrame active={suggested.has('tools')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('tools')}>Used by</FieldLabel>
              <ScopeChips
                testId="doc-scope-tools"
                options={KNOWLEDGE_TOOLS}
                selected={tools}
                vocabulary={KNOWLEDGE_TOOL_KEYS}
                onChange={(next) => {
                  setTools(next);
                  suggested.clear('tools');
                }}
              />
              <Hint>{toolsPhrase(tools)}</Hint>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('species')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('species')}>Species</FieldLabel>
              <ScopeChips
                testId="doc-scope-species"
                options={KNOWLEDGE_SPECIES}
                selected={species}
                vocabulary={KNOWLEDGE_SPECIES_KEYS}
                onChange={(next) => {
                  setSpecies(next);
                  suggested.clear('species');
                }}
              />
              <Hint>{speciesPhrase(species)} A cat document never reaches a dog scan.</Hint>
            </SuggestedFieldFrame>

            {scopeProblem ? (
              <InlineAlert tone="warn">{scopeProblem}</InlineAlert>
            ) : (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 12,
                  background: COLOR.infoSoft,
                  color: 'oklch(0.40 0.13 245)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {summary}
              </div>
            )}

            {overridesError ? (
              <InlineAlert tone="warn" title="Couldn’t check usage">
                The scenario list didn’t load ({overridesError}), so we can’t say which
                scenarios draw on this document.
              </InlineAlert>
            ) : (
              links.length > 0 && (
                <div style={{ fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.45 }}>
                  In use by {links.length} scenario{links.length === 1 ? '' : 's'}:{' '}
                  {links.slice(0, 4).map((l) => l.label).join(', ')}
                  {links.length > 4 ? ` and ${links.length - 4} more` : ''}.
                </div>
              )
            )}
          </ModalSection>
        </div>

        {/* ── The text itself, folded away ── */}
        <ContentDisclosure
          content={preview}
          truncatedNote={
            truncated
              ? `Showing the first ${PREVIEW_CHARS.toLocaleString()} characters of ${doc.content.length.toLocaleString()}. Scenarios draw on the whole document, not just this preview.`
              : undefined
          }
          action={
            searchable && rebuildButton ? (
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 11.5, color: COLOR.inkMute }}>
                  Re-split this document if you changed it elsewhere — safe to re-run.
                </span>
                {rebuildButton}
              </div>
            ) : undefined
          }
        />

        {note && <div style={{ fontSize: 12.5, color: COLOR.success, fontWeight: 700 }}>{note}</div>}
        {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 700 }}>{error}</div>}

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderTop: `1px solid ${COLOR.border}`,
            paddingTop: 14,
          }}
        >
          {canWrite && (
            <button
              onClick={() => void remove()}
              disabled={busy !== null}
              style={{
                ...btnSecondary,
                border: '1px solid transparent',
                background: 'transparent',
                color: COLOR.danger,
              }}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button onClick={attemptClose} disabled={busy !== null} style={btnSecondary}>
              Cancel
            </button>
            {canWrite && (
              <button
                onClick={() => void save()}
                disabled={busy !== null || !dirty || scopeProblem !== null}
                style={
                  // Nothing to save reads as "nothing to do", not as a broken
                  // primary: a faded red button looks like a failure state.
                  dirty
                    ? {
                        ...btnPrimary,
                        opacity: busy !== null || scopeProblem !== null ? 0.5 : 1,
                      }
                    : { ...btnSecondary, color: COLOR.inkMute, cursor: 'default' }
                }
              >
                {saveLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/*
        Last in the DOM so the first thing focus lands on when the dialog opens
        is the first field, not the way out.
      */}
      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <ModalCloseButton onClose={onClose} />
      </div>
    </Modal>
  );
}

/** Human name for a scenario id, falling back to the raw id. */
function scenarioTitle(scenarioId: string): string {
  const seed = LIBRARY_MANIFEST.find((s) => s.id === scenarioId);
  if (seed) return seed.title;
  if (scenarioId.startsWith('admin:')) return `Custom scenario ${scenarioId.slice(6, 12)}`;
  if (scenarioId.startsWith('user:')) return `User scenario ${scenarioId.slice(5, 11)}`;
  return scenarioId;
}

// ─── Add document modal ─────────────────────────────────────────────────────

type AddMode = 'pdf' | 'text';

function AddDocumentModal({
  open,
  onClose,
  onIngested,
}: {
  open: boolean;
  onClose: () => void;
  onIngested: (res: IngestResult) => void;
}) {
  const [mode, setMode] = useState<AddMode>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'clinical' | 'custom'>('clinical');
  const [focus, setFocus] = useState<string | null>(null);
  // Default scope: the four training tools, every species. Fecal Scan is
  // deliberately off — it only ever gets what someone filed there on purpose.
  const [tools, setTools] = useState<string[]>([...DEFAULT_KNOWLEDGE_TOOLS]);
  const [species, setSpecies] = useState<string[]>([...ALL_KNOWLEDGE_SPECIES]);
  const [citation, setCitation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    The tag assistant. It has something to read once a PDF is chosen or the
    pasted text is long enough to be a document rather than a sentence; until
    then there is no panel at all. It runs on a click, unless the admin has
    said "always" — a preference kept in this browser only.
  */
  const assistant = useKnowledgeAssistant();
  const suggested = useSuggestedFields();
  const [autoSuggest, setAutoSuggest] = useState<boolean>(readAutoSuggest);
  const autoRan = useRef(false);
  const assistantSource: 'pdf' | 'text' | null =
    mode === 'pdf'
      ? file
        ? 'pdf'
        : null
      : text.trim().length >= ASSISTANT_MIN_CHARS
        ? 'text'
        : null;

  // A different file (or a different way in) is a different document: the
  // old proposal — and the old extraction — must not survive it.
  useEffect(() => {
    assistant.reset();
    suggested.reset();
    autoRan.current = false;
  }, [file, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!assistantSource) {
      autoRan.current = false;
      if (assistant.status !== 'idle') assistant.reset();
      return;
    }
    if (autoSuggest && assistant.status === 'idle' && !autoRan.current) {
      autoRan.current = true;
      void runAssistant();
    }
  }, [assistantSource, autoSuggest, assistant.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function setAutoSuggestPref(next: boolean) {
    setAutoSuggest(next);
    writeAutoSuggest(next);
  }

  async function runAssistant() {
    if (assistantSource === 'pdf' && file) {
      let pdfBase64: string;
      try {
        pdfBase64 = await readFileAsBase64(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read file');
        return;
      }
      await assistant.run({ pdfBase64 });
    } else if (assistantSource === 'text') {
      const hint = title.trim();
      await assistant.run({ text: text.trim(), ...(hint ? { title: hint } : {}) });
    }
  }

  /**
   * Copy the proposal into the fields. A title the admin already typed is
   * theirs and stays; everything else is prefilled and marked, and the mark
   * comes off the moment they touch the field.
   */
  function applySuggestions() {
    if (!assistant.analysis) return;
    const s = sanitizeSuggestion(assistant.analysis, assistant.extractedCitation ?? undefined);
    const marks: SuggestedKey[] = ['category', 'focus', 'tools', 'species'];
    if (!title.trim() && s.title) {
      setTitle(s.title);
      marks.push('title');
    }
    setCategory(s.category);
    setFocus(s.focus);
    setTools(s.tools);
    setSpecies(s.species);
    if (s.citation) {
      setCitation(s.citation);
      marks.push('citation');
    }
    suggested.mark(marks);
    assistant.hide(true);
  }

  function reset() {
    setMode('pdf');
    setFile(null);
    setText('');
    setTitle('');
    setCategory('clinical');
    setFocus(null);
    setTools([...DEFAULT_KNOWLEDGE_TOOLS]);
    setSpecies([...ALL_KNOWLEDGE_SPECIES]);
    setCitation('');
    setError(null);
    assistant.reset();
    suggested.reset();
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function handleFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setError(
        `That PDF is ${(f.size / 1024 / 1024).toFixed(1)}MB — a little too big. Anything up to 4MB works; try a compressed copy or split it in two.`,
      );
      setFile(null);
      return;
    }
    setFile(f);
  }

  const canSubmit =
    !busy &&
    tools.length > 0 &&
    species.length > 0 &&
    (mode === 'pdf' ? file !== null : text.trim().length > 0 && title.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const tags = { ...(focus ? { focus } : {}), tools, species };
      const citationLine = citation.trim() || undefined;
      let res: IngestResult;
      if (mode === 'pdf') {
        if (!file) throw new Error('Choose a PDF file first.');
        if (assistant.extractedMarkdown) {
          // The assistant already pulled the text out of this PDF, so send
          // THAT — extracting it a second time would cost another 20 s and
          // could disagree with what the admin just read the proposal from.
          res = await ingestKnowledge({
            text: assistant.extractedMarkdown,
            title:
              title.trim() ||
              (assistant.analysis ? sanitizeSuggestion(assistant.analysis).title : '') ||
              file.name.replace(/\.pdf$/i, ''),
            category,
            tags,
            citation: citationLine ?? assistant.extractedCitation ?? undefined,
          });
        } else {
          const pdfBase64 = await readFileAsBase64(file);
          res = await ingestKnowledge({
            pdfBase64,
            title: title.trim() || undefined,
            category,
            tags,
            citation: citationLine,
          });
        }
      } else {
        res = await ingestKnowledge({
          text: text.trim(),
          title: title.trim(),
          category,
          tags,
          citation: citationLine,
        });
      }
      reset();
      onIngested(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  }

  const summary = scopeSummarySentence(tools, species);
  const scopeProblem =
    tools.length === 0
      ? 'Pick at least one tool — a document no tool is allowed to read can never be retrieved.'
      : species.length === 0
        ? 'Pick at least one species — a document with no species can never be retrieved.'
        : null;

  return (
    <Modal open={open} onClose={handleClose} width={880} ariaLabel="Add document">
      <div style={{ padding: '18px 22px 16px', display: 'grid', gap: 12, overflowY: 'auto' }}>
        <div style={{ paddingRight: 44, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.02em' }}>
            Add document
          </h2>
          <span style={{ fontSize: 12, color: COLOR.inkMute }}>
            Three steps. Everything here can be changed afterwards.
          </span>
        </div>

        <StepSection
          step={1}
          title="Choose the file or paste text"
          action={
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setMode('pdf')}
                style={{
                  ...(mode === 'pdf' ? btnPrimary : btnSecondary),
                  fontSize: 12.5,
                  padding: '5px 12px',
                }}
              >
                Upload PDF
              </button>
              <button
                onClick={() => setMode('text')}
                style={{
                  ...(mode === 'text' ? btnPrimary : btnSecondary),
                  fontSize: 12.5,
                  padding: '5px 12px',
                }}
              >
                Paste text
              </button>
            </div>
          }
        >
          {mode === 'pdf' ? (
            <div>
              <input
                type="file"
                accept="application/pdf"
                aria-label="PDF file"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
              <Hint>
                {file
                  ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)`
                  : 'Up to 4MB. Leave the title blank and we’ll take it from the paper.'}
              </Hint>
            </div>
          ) : (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                aria-label="Text"
                style={textareaStyle}
                placeholder="Paste the document text…"
              />
              <Hint>Protocols, handouts or notes — anything the AI should be able to quote.</Hint>
            </div>
          )}
        </StepSection>

        {/*
          Between "what did you bring" and "how should it be filed": the
          assistant offers to do the filing. It is a proposal — steps 2 and 3
          stay the form, and every field it touches says so until edited.
        */}
        {assistantSource && (
          <KnowledgeAssistantPanel
            assistant={assistant}
            onRun={() => void runAssistant()}
            onApply={applySuggestions}
            source={assistantSource}
            autoSuggest={{ value: autoSuggest, onChange: setAutoSuggestPref }}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <StepSection step={2} title="Name and file it">
            <SuggestedFieldFrame active={suggested.has('title')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('title')}>
                {mode === 'pdf' ? 'Title (optional)' : 'Title'}
              </FieldLabel>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  suggested.clear('title');
                }}
                style={inputStyle}
                placeholder="Document title"
              />
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('category')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('category')}>Type</FieldLabel>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as 'clinical' | 'custom');
                  suggested.clear('category');
                }}
                aria-label="Type"
                style={inputStyle}
              >
                {UPLOAD_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('focus')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('focus')}>Focus area (optional)</FieldLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FOCUS_AREAS.map((f) => (
                  <FocusChipButton
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    active={focus === f.key}
                    onClick={() => {
                      setFocus(focus === f.key ? null : f.key);
                      suggested.clear('focus');
                    }}
                  />
                ))}
              </div>
              <Hint>
                {focus
                  ? FOCUS_AREAS.find((f) => f.key === focus)?.description
                  : 'Leave blank and every scenario that doesn’t restrict itself can use it.'}
              </Hint>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('citation')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('citation')}>Citation (optional)</FieldLabel>
              <input
                value={citation}
                onChange={(e) => {
                  setCitation(e.target.value);
                  suggested.clear('citation');
                }}
                aria-label="Citation"
                placeholder="e.g. Davies et al., 2024 — Veterinary Record"
                style={inputStyle}
              />
              <Hint>Shown to the AI next to anything it quotes.</Hint>
            </SuggestedFieldFrame>
          </StepSection>

          <StepSection step={3} title="Who can use it">
            <SuggestedFieldFrame active={suggested.has('tools')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('tools')}>Used by</FieldLabel>
              <ScopeChips
                testId="add-scope-tools"
                options={KNOWLEDGE_TOOLS}
                selected={tools}
                vocabulary={KNOWLEDGE_TOOL_KEYS}
                onChange={(next) => {
                  setTools(next);
                  suggested.clear('tools');
                }}
              />
              <Hint>{toolsPhrase(tools)} Tick Fecal Scan to supplement the stool charts.</Hint>
            </SuggestedFieldFrame>

            <SuggestedFieldFrame active={suggested.has('species')} flashKey={suggested.flashKey}>
              <FieldLabel suggested={suggested.has('species')}>Species</FieldLabel>
              <ScopeChips
                testId="add-scope-species"
                options={KNOWLEDGE_SPECIES}
                selected={species}
                vocabulary={KNOWLEDGE_SPECIES_KEYS}
                onChange={(next) => {
                  setSpecies(next);
                  suggested.clear('species');
                }}
              />
              <Hint>{speciesPhrase(species)} A cat document never reaches a dog scan.</Hint>
            </SuggestedFieldFrame>

            {scopeProblem ? (
              <InlineAlert tone="warn">{scopeProblem}</InlineAlert>
            ) : (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 12,
                  background: COLOR.infoSoft,
                  color: 'oklch(0.40 0.13 245)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {summary}
              </div>
            )}
          </StepSection>
        </div>

        {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 700 }}>{error}</div>}

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderTop: `1px solid ${COLOR.border}`,
            paddingTop: 12,
          }}
        >
          <span style={{ flex: 1, minWidth: 300, fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.45 }}>
            <strong style={{ fontWeight: 800 }}>What happens next:</strong> we read the text,
            split it into short sections and make them searchable — usually under a minute.
          </span>
          <button style={btnSecondary} onClick={handleClose}>
            Cancel
          </button>
          <button
            style={
              canSubmit || busy
                ? { ...btnPrimary, opacity: busy ? 0.6 : 1 }
                : { ...btnSecondary, color: COLOR.inkMute, cursor: 'default' }
            }
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy ? 'Adding…' : 'Add document'}
          </button>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <ModalCloseButton onClose={handleClose} />
      </div>
    </Modal>
  );
}

/** Read a File as base64, stripping the `data:...;base64,` prefix. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
