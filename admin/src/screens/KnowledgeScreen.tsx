/**
 * KnowledgeScreen — the admin's library of source material for the AI.
 *
 * Written for the person who uploads documents, not for the person who wrote
 * the embedder: types and sources read as words ("Clinical reference",
 * "Built-in"), focus areas come from the shared vocabulary that scenarios
 * filter retrieval by, and the technical operations (indexing, seeding, raw
 * slugs) are still here — just labelled in plain language and explained
 * in-place via InfoTip.
 *
 * Everything that is more than one click deep lives in the detail modal:
 * content preview, indexing state, slug, focus/citation editing, delete.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Glass } from '../primitives/Glass';
import {
  EmptyState,
  InfoTip,
  Kpi,
  LoadingShimmer,
  Modal,
  ModalCloseButton,
  StatusPill,
} from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import {
  deleteKnowledge,
  ingestBundledStudies,
  ingestKnowledge,
  reembedKnowledge,
  seedKnowledge,
  useKnowledgeDocuments,
  useScenarioOverrides,
} from '../data/queries';
import {
  UPLOAD_CATEGORIES,
  categoryLabel,
  docCitation,
  filterKnowledgeDocs,
  isBuiltIn,
  resolveDocFocus,
  scenariosUsingDoc,
  sourceLabel,
  updateKnowledgeDocument,
} from '../data/knowledgeActions';
import { LIBRARY_MANIFEST } from '../data/scenarioManifest';
import { FOCUS_AREAS, focusAreaLabel } from '../../../src/shared/knowledge/focusAreas';
import type { KnowledgeDocument } from '../data/types';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { Field, btnPrimary, btnSecondary, inputStyle, textareaStyle } from './FlagsScreen';

const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4MB
const PREVIEW_CHARS = 4000;
const GRID = '1.8fr 130px 150px 100px 90px 150px';

// ─── Small shared bits ──────────────────────────────────────────────────────

function TypePill({ category }: { category: string }) {
  const tone: 'info' | 'success' | 'neutral' =
    category === 'clinical' ? 'info' : category === 'custom' ? 'success' : 'neutral';
  return (
    <StatusPill tone={tone} dot={false}>
      {categoryLabel(category)}
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

const INDEXING_HELP = (
  <>
    <p style={{ margin: '0 0 10px' }}>
      Indexing splits a document into short sections and stores a numeric
      “fingerprint” of each one. During a roleplay the app looks up the sections
      that best match what the client just said and feeds only those to the AI —
      that is how a scenario stays grounded in your material instead of the
      model's general knowledge.
    </p>
    <p style={{ margin: 0 }}>
      Rebuilding is safe to re-run at any time. It replaces the sections for this
      one document and leaves everything else alone. You only need it if a
      document shows “Not indexed yet”, or after the search set-up changes.
    </p>
  </>
);

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

// ─── Bulk-action button (busy state + transient "✓ Done (n)" / error) ──────

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; n: number }
  | { kind: 'error'; message: string };

function BulkActionButton({
  label,
  busyLabel,
  doneNoun,
  onRun,
  info,
}: {
  label: string;
  busyLabel: string;
  doneNoun: string;
  onRun: () => Promise<number>;
  info: { title: string; body: ReactNode };
}) {
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'busy' });
    try {
      const n = await onRun();
      setState({ kind: 'done', n });
      setTimeout(() => setState({ kind: 'idle' }), 4000);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Action failed',
      });
    }
  }

  const busy = state.kind === 'busy';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button onClick={run} disabled={busy} style={{ ...btnSecondary, opacity: busy ? 0.6 : 1 }}>
        {busy ? busyLabel : label}
      </button>
      <InfoTip title={info.title}>{info.body}</InfoTip>
      {state.kind === 'done' && (
        <span style={{ fontSize: 12.5, color: COLOR.success, fontWeight: 700 }}>
          ✓ {state.n} {doneNoun} ready
        </span>
      )}
      {state.kind === 'error' && (
        <span style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 700 }}>
          {state.message}
        </span>
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
  const [adding, setAdding] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [focusFilter, setFocusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  const stats = useMemo(() => {
    const d = docs.data;
    return {
      total: d.length,
      chunks: d.reduce((s, doc) => s + (doc.chunk_count ?? 0), 0),
      cited: d.filter((doc) => docCitation(doc.metadata) !== null).length,
      uploaded: d.filter((doc) => !isBuiltIn(doc)).length,
    };
  }, [docs.data]);

  const filtered = useMemo(
    () => filterKnowledgeDocs(docs.data, { query, focus: focusFilter, category: typeFilter }),
    [docs.data, query, focusFilter, typeFilter],
  );

  // Present focus filters that actually match something, so the row doesn't
  // advertise buckets this corpus has nothing in.
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

  const openDoc = openSlug ? docs.data.find((d) => d.slug === openSlug) ?? null : null;

  return (
    <>
      <ContextBar
        title="Knowledge"
        subtitle="The source material your scenarios can quote from. Upload a study, file it under a focus area, and scenarios set to that area will use it."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {docs.loading ? (
            Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
          ) : (
            <>
              <Kpi label="Documents" value={stats.total} icon="⌆" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
              <Kpi label="Indexed sections" value={stats.chunks} icon="▤" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
              <Kpi label="Cited studies" value={stats.cited} icon="✦" accent={COLOR.successSoft} sparkColor={COLOR.success} />
              <Kpi label="Uploaded docs" value={stats.uploaded} icon="✎" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
            </>
          )}
        </div>

        <Glass padding={18} radius={20}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <BulkActionButton
              label="Load built-in knowledge"
              busyLabel="Loading…"
              doneNoun="documents"
              info={{
                title: 'Load built-in knowledge',
                body: (
                  <>
                    <p style={{ margin: '0 0 10px' }}>
                      Loads the knowledge that ships with the app — the four ECHO
                      driver personas, the pushback playbook, the ACT method, and
                      the clinical reference (body condition scoring, calories,
                      product anchors) — into this library as documents you can
                      read and tag.
                    </p>
                    <p style={{ margin: 0 }}>
                      Safe to run whenever you like: it rebuilds those built-in
                      documents from the current app content (keeping any focus
                      area you filed them under) and never touches documents you
                      uploaded.
                    </p>
                  </>
                ),
              }}
              onRun={async () => {
                const res = await seedKnowledge();
                refresh();
                return res.seeded;
              }}
            />
            <BulkActionButton
              label="Load bundled studies"
              busyLabel="Loading…"
              doneNoun="studies"
              info={{
                title: 'Load bundled studies',
                body: (
                  <>
                    <p style={{ margin: '0 0 10px' }}>
                      Loads the five veterinary communication and obesity studies
                      that ship with the app. Each PDF is read, turned into text,
                      split into sections, and indexed — the same thing that
                      happens when you upload a document yourself.
                    </p>
                    <p style={{ margin: 0 }}>
                      Safe to re-run: the studies are replaced rather than
                      duplicated, and your own uploads are untouched. It takes a
                      minute or two because each paper is read end to end.
                    </p>
                  </>
                ),
              }}
              onRun={async () => {
                const res = await ingestBundledStudies();
                refresh();
                return res.ingested;
              }}
            />
            <span style={{ marginLeft: 'auto' }}>
              <button style={btnPrimary} onClick={() => setAdding(true)}>
                + Add document
              </button>
            </span>
          </div>
        </Glass>

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
            {typeKeys.length > 1 && (
              <FilterRow
                label="Type"
                options={[
                  { key: 'all', label: 'All' },
                  ...typeKeys.map((k) => ({ key: k, label: categoryLabel(k) })),
                ]}
                value={typeFilter}
                onChange={setTypeFilter}
              />
            )}
          </div>
        </Glass>

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
            {['Title', 'Type', 'Focus area', 'Source', 'Updated', ''].map((h, i) => (
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
                  ? 'Start with “Load built-in knowledge”, then add your own studies with “+ Add document”.'
                  : 'Clear the search box or pick a different focus area.'
              }
            />
          )}
        </Glass>
      </ScreenShell>

      <AddDocumentModal
        open={adding}
        onClose={() => setAdding(false)}
        onIngested={() => {
          setAdding(false);
          refresh();
        }}
      />

      <DocumentModal
        doc={openDoc}
        overrides={overrides.data}
        onClose={() => setOpenSlug(null)}
        onChanged={refresh}
        onDeleted={() => {
          setOpenSlug(null);
          refresh();
        }}
      />
    </>
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
  const citation = docCitation(doc.metadata);
  return (
    <div
      role="button"
      tabIndex={0}
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
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{doc.title}</div>
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
          <StatusPill tone="warn" dot={false}>
            {focusAreaLabel(focus)}
          </StatusPill>
        ) : (
          '—'
        )}
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
  onClose,
  onChanged,
  onDeleted,
}: {
  doc: KnowledgeDocument | null;
  overrides: Array<{
    scenario_id: string;
    focus_area: string | null;
    knowledge_slugs: string[] | null;
  }>;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('custom');
  const [focus, setFocus] = useState<string | null>(null);
  const [citation, setCitation] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'index' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-seed the editor whenever a different document is opened (or the list
  // refreshes underneath it after a save).
  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setCategory(doc.category);
    setFocus(resolveDocFocus(doc.metadata));
    setCitation(docCitation(doc.metadata) ?? '');
    setError(null);
    setNote(null);
    setConfirmDelete(false);
  }, [doc?.slug, doc?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;

  const builtIn = isBuiltIn(doc);
  const indexed = (doc.chunk_count ?? 0) > 0;
  const preview = doc.content.slice(0, PREVIEW_CHARS);
  const truncated = doc.content.length > PREVIEW_CHARS;
  const links = scenariosUsingDoc(doc, overrides, scenarioTitle);

  const dirty =
    title.trim() !== doc.title ||
    category !== doc.category ||
    focus !== resolveDocFocus(doc.metadata) ||
    citation.trim() !== (docCitation(doc.metadata) ?? '');

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
      });
      setNote(
        res.chunks_updated > 0
          ? `Saved — ${res.chunks_updated} indexed section${res.chunks_updated === 1 ? '' : 's'} re-tagged.`
          : 'Saved.',
      );
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
      setNote(`Search index rebuilt — ${res.chunks} sections.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rebuild failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!doc) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteKnowledge(doc.slug);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} width={720} ariaLabel={doc.title}>
      <div style={{ padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <TypePill category={doc.category} />
              <SourcePill source={doc.source} />
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.02em' }}>
              {doc.title}
            </h2>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
          {/* Indexing state */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 14px',
              borderRadius: 12,
              background: indexed ? COLOR.successSoft : COLOR.warnSoft,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.ink }}>
              {indexed
                ? `Searchable — ${doc.chunk_count} section${doc.chunk_count === 1 ? '' : 's'} indexed`
                : 'Not indexed yet — scenarios can’t pull from this document'}
            </span>
            <InfoTip title="Search indexing">{INDEXING_HELP}</InfoTip>
            <span style={{ marginLeft: 'auto' }}>
              <button
                onClick={rebuild}
                disabled={busy !== null}
                style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, opacity: busy ? 0.6 : 1 }}
              >
                {busy === 'index' ? 'Rebuilding…' : 'Rebuild search index'}
              </button>
            </span>
          </div>

          {/* Title + type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={builtIn}
                style={{ ...inputStyle, opacity: builtIn ? 0.6 : 1 }}
              />
            </Field>
            <Field label="Type">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={builtIn}
                style={{ ...inputStyle, opacity: builtIn ? 0.6 : 1 }}
              >
                {(builtIn
                  ? [{ value: doc.category, label: categoryLabel(doc.category) }]
                  : UPLOAD_CATEGORIES
                ).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {builtIn && (
            <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: -8 }}>
              This document comes with the app, so its title and type are rebuilt
              from the app content each time you load built-in knowledge. You can
              still set its focus area and citation.
            </div>
          )}

          {/* Focus area */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: COLOR.inkMute,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                Focus area
              </span>
              <InfoTip title="Focus area">{FOCUS_HELP}</InfoTip>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <FocusChipButton label="None" active={focus === null} onClick={() => setFocus(null)} />
              {FOCUS_AREAS.map((f) => (
                <FocusChipButton
                  key={f.key}
                  label={f.label}
                  description={f.description}
                  active={focus === f.key}
                  onClick={() => setFocus(focus === f.key ? null : f.key)}
                />
              ))}
            </div>
            {focus && (
              <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 6 }}>
                {FOCUS_AREAS.find((f) => f.key === focus)?.description}
              </div>
            )}
          </div>

          <Field label="Citation" help="Shown to the AI alongside any passage it quotes from this document.">
            <input
              value={citation}
              onChange={(e) => setCitation(e.target.value)}
              placeholder="e.g. Davies et al., 2024 — Veterinary Record"
              style={inputStyle}
            />
          </Field>

          {/* Used by scenarios */}
          {links.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: COLOR.inkMute,
                  fontFamily: 'var(--pbt-mono)',
                  marginBottom: 6,
                }}
              >
                Used by scenarios
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {links.slice(0, 12).map((l) => (
                  <StatusPill key={`${l.scenario_id}-${l.via}`} tone={l.via === 'attached' ? 'info' : 'neutral'} dot={false}>
                    {l.label}
                    {l.via === 'focus' ? ' · via focus' : ''}
                  </StatusPill>
                ))}
                {links.length > 12 && (
                  <span style={{ fontSize: 11.5, color: COLOR.inkMute, alignSelf: 'center' }}>
                    +{links.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Content preview */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.10em',
                color: COLOR.inkMute,
                fontFamily: 'var(--pbt-mono)',
                marginBottom: 6,
              }}
            >
              Content
            </div>
            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${COLOR.border}`,
                background: 'rgba(255,255,255,0.6)',
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11.5,
                lineHeight: 1.65,
                color: COLOR.inkSoft,
                whiteSpace: 'pre-wrap',
              }}
            >
              {preview || '(empty)'}
            </div>
            {truncated && (
              <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 6 }}>
                Showing the first {PREVIEW_CHARS.toLocaleString()} characters of{' '}
                {doc.content.length.toLocaleString()}. The whole document is indexed.
              </div>
            )}
          </div>

          {note && <div style={{ fontSize: 12.5, color: COLOR.success, fontWeight: 700 }}>{note}</div>}
          {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 700 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={save}
              disabled={busy !== null || !dirty}
              style={{ ...btnPrimary, opacity: busy !== null || !dirty ? 0.5 : 1 }}
            >
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={onClose} disabled={busy !== null} style={btnSecondary}>
              Close
            </button>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {confirmDelete ? (
                <>
                  <span style={{ fontSize: 12, color: COLOR.inkMute, maxWidth: 320 }}>
                    {builtIn
                      ? 'Delete this built-in document? Loading built-in knowledge brings it back.'
                      : 'Delete this document and its indexed sections? This can’t be undone.'}
                  </span>
                  <button
                    onClick={remove}
                    disabled={busy !== null}
                    style={{ ...btnSecondary, color: COLOR.danger, fontWeight: 800 }}
                  >
                    {busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={btnSecondary}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                  style={{ ...btnSecondary, color: COLOR.danger }}
                >
                  Delete
                </button>
              )}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 10.5,
              color: COLOR.inkMute,
              borderTop: `1px solid ${COLOR.border}`,
              paddingTop: 10,
            }}
          >
            ID {doc.slug}
          </div>
        </div>
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
  onIngested: () => void;
}) {
  const [mode, setMode] = useState<AddMode>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'clinical' | 'custom'>('clinical');
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode('pdf');
    setFile(null);
    setText('');
    setTitle('');
    setCategory('clinical');
    setFocus(null);
    setError(null);
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
    (mode === 'pdf' ? file !== null : text.trim().length > 0 && title.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const tags = focus ? { focus } : undefined;
      if (mode === 'pdf') {
        if (!file) throw new Error('Choose a PDF file first.');
        const pdfBase64 = await readFileAsBase64(file);
        await ingestKnowledge({
          pdfBase64,
          title: title.trim() || undefined,
          category,
          tags,
        });
      } else {
        await ingestKnowledge({
          text: text.trim(),
          title: title.trim(),
          category,
          tags,
        });
      }
      reset();
      onIngested();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} width={580} ariaLabel="Add document">
      <div style={{ padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink }}>Add document</h2>
          <ModalCloseButton onClose={handleClose} />
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setMode('pdf')}
              style={{
                ...(mode === 'pdf' ? btnPrimary : btnSecondary),
                fontSize: 12.5,
                padding: '6px 12px',
              }}
            >
              Upload PDF
            </button>
            <button
              onClick={() => setMode('text')}
              style={{
                ...(mode === 'text' ? btnPrimary : btnSecondary),
                fontSize: 12.5,
                padding: '6px 12px',
              }}
            >
              Paste text
            </button>
          </div>

          {mode === 'pdf' ? (
            <Field label="PDF file" help="Up to 4MB. Leave the title blank and we'll take it from the paper.">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
              {file && (
                <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 4 }}>
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </Field>
          ) : (
            <Field label="Text" help="Paste protocols, handouts, or notes — anything the AI should be able to quote.">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                style={textareaStyle}
                placeholder="Paste the document text…"
              />
            </Field>
          )}

          <Field label={mode === 'pdf' ? 'Title (optional)' : 'Title'}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Document title"
            />
          </Field>

          <Field label="Type">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'clinical' | 'custom')}
              style={inputStyle}
            >
              {UPLOAD_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: COLOR.inkMute,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                Focus area (optional)
              </span>
              <InfoTip title="Focus area">
                <p style={{ margin: 0 }}>
                  Scenarios set to a focus area only pull documents tagged with
                  the same area. Leave blank to make this document available to
                  every scenario.
                </p>
              </InfoTip>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FOCUS_AREAS.map((f) => (
                <FocusChipButton
                  key={f.key}
                  label={f.label}
                  description={f.description}
                  active={focus === f.key}
                  onClick={() => setFocus(focus === f.key ? null : f.key)}
                />
              ))}
            </div>
            {focus && (
              <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 6 }}>
                {FOCUS_AREAS.find((f) => f.key === focus)?.description}
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: 12,
              color: COLOR.inkSoft,
              lineHeight: 1.55,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.6)',
              border: `1px solid ${COLOR.border}`,
            }}
          >
            <strong style={{ fontWeight: 800 }}>What happens next:</strong> we’ll
            extract the text, split it into sections, and index it so scenarios
            can pull from it — usually under a minute.
          </div>

          {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5 }}
              disabled={!canSubmit}
              onClick={submit}
            >
              {busy ? 'Adding…' : 'Add document'}
            </button>
            <button style={btnSecondary} onClick={handleClose}>
              Cancel
            </button>
          </div>
        </div>
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
