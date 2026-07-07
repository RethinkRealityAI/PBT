/**
 * KnowledgeScreen — admin editor for the RAG knowledge base.
 *
 * Lets an admin seed the code-derived knowledge (driver profiles, pushback
 * taxonomy, ACT guide, clinical reference, scoring rubric), ingest bundled
 * research studies, and add ad-hoc documents (PDF upload or pasted text) that
 * feed the retrieval corpus used by the simulation prompts.
 */
import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import {
  EmptyState,
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
} from '../data/queries';
import type { KnowledgeDocument } from '../data/types';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { Field, btnPrimary, btnSecondary, inputStyle, textareaStyle } from './FlagsScreen';

const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4MB

const FOCUS_AREAS = ['gi', 'dermatitis', 'urinary', 'weight', 'aging'] as const;
type FocusArea = (typeof FOCUS_AREAS)[number];

// ─── Bulk-action button (busy state + transient "✓ Done (n)" / error) ──────

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; n: number }
  | { kind: 'error'; message: string };

function BulkActionButton({
  label,
  busyLabel,
  onRun,
}: {
  label: string;
  busyLabel: string;
  onRun: () => Promise<number>;
}) {
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'busy' });
    try {
      const n = await onRun();
      setState({ kind: 'done', n });
      setTimeout(() => setState({ kind: 'idle' }), 3000);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Action failed',
      });
    }
  }

  const busy = state.kind === 'busy';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button onClick={run} disabled={busy} style={{ ...btnSecondary, opacity: busy ? 0.6 : 1 }}>
        {busy ? busyLabel : label}
      </button>
      {state.kind === 'done' && (
        <span style={{ fontSize: 12.5, color: COLOR.success, fontWeight: 700 }}>
          ✓ Done ({state.n})
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

// ─── Category / source pills ────────────────────────────────────────────────

function CategoryPill({ category }: { category: string }) {
  const tone: 'info' | 'success' | 'neutral' =
    category === 'clinical' ? 'info' : category === 'custom' ? 'success' : 'neutral';
  return (
    <StatusPill tone={tone} dot={false}>
      {category}
    </StatusPill>
  );
}

function SourcePill({ source }: { source: string }) {
  const tone: 'neutral' | 'info' = source === 'code-seed' ? 'neutral' : 'info';
  return (
    <StatusPill tone={tone} dot={false}>
      {source === 'code-seed' ? 'code-seed' : 'admin'}
    </StatusPill>
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
  const [adding, setAdding] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ slug: string; message: string } | null>(null);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  const stats = useMemo(() => {
    const d = docs.data;
    return {
      total: d.length,
      chunks: d.reduce((s, doc) => s + (doc.chunk_count ?? 0), 0),
      clinical: d.filter((doc) => doc.category === 'clinical').length,
      custom: d.filter((doc) => doc.category === 'custom').length,
    };
  }, [docs.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? docs.data.filter((d) => `${d.title} ${d.slug}`.toLowerCase().includes(q))
      : docs.data;
    return [...list].sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      return cat !== 0 ? cat : a.title.localeCompare(b.title);
    });
  }, [docs.data, query]);

  async function handleReembed(slug: string) {
    setRowBusy(slug);
    setRowError(null);
    try {
      await reembedKnowledge(slug);
      refresh();
    } catch (err) {
      setRowError({ slug, message: err instanceof Error ? err.message : 'Re-embed failed' });
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDelete(doc: KnowledgeDocument) {
    if (
      !confirm(
        `Delete "${doc.title}"? This removes the document and its chunks from the retrieval corpus.`,
      )
    ) {
      return;
    }
    setRowBusy(doc.slug);
    setRowError(null);
    try {
      await deleteKnowledge(doc.slug);
      refresh();
    } catch (err) {
      setRowError({ slug: doc.slug, message: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      <ContextBar
        title="Knowledge"
        subtitle="RAG knowledge base — seed code knowledge, ingest studies, and manage custom documents."
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
              <Kpi label="Chunks" value={stats.chunks} icon="▤" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
              <Kpi label="Cited studies" value={stats.clinical} icon="✦" accent={COLOR.successSoft} sparkColor={COLOR.success} />
              <Kpi label="Custom docs" value={stats.custom} icon="✎" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
            </>
          )}
        </div>

        <Glass padding={18} radius={20}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <BulkActionButton
              label="Seed code knowledge"
              busyLabel="Seeding…"
              onRun={async () => {
                const res = await seedKnowledge();
                refresh();
                return res.seeded;
              }}
            />
            <BulkActionButton
              label="Ingest bundled studies"
              busyLabel="Ingesting…"
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

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 100px 100px 70px 90px 190px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Title', 'Slug', 'Category', 'Source', 'Chunks', 'Updated', 'Actions'].map((h) => (
              <div
                key={h}
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
          {filtered.map((doc) => {
            const busy = rowBusy === doc.slug;
            const err = rowError?.slug === doc.slug ? rowError.message : null;
            return (
              <div
                key={doc.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 100px 100px 70px 90px 190px',
                  padding: '12px 22px',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, minWidth: 0 }}>
                  {doc.title}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--pbt-mono)',
                    fontSize: 11,
                    color: COLOR.inkMute,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.slug}
                </div>
                <CategoryPill category={doc.category} />
                <SourcePill source={doc.source} />
                <div style={{ fontSize: 12.5, color: COLOR.ink, fontWeight: 700 }}>
                  {doc.chunk_count}
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                  {fmtAgo(new Date(doc.updated_at).getTime())}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleReembed(doc.slug)}
                      disabled={busy}
                      style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.6 : 1 }}
                    >
                      {busy ? '…' : 'Re-embed'}
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={busy}
                      style={{
                        ...btnSecondary,
                        padding: '5px 10px',
                        fontSize: 11.5,
                        color: COLOR.danger,
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {err && <span style={{ fontSize: 10.5, color: COLOR.danger }}>{err}</span>}
                </div>
              </div>
            );
          })}
          {!docs.loading && filtered.length === 0 && (
            <EmptyState
              title="No documents yet"
              subtitle="Seed code knowledge or ingest the bundled studies to build the retrieval corpus."
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
    </>
  );
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
  const [focus, setFocus] = useState<FocusArea | null>(null);
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
      setError('PDF is larger than 4MB — please upload a smaller file.');
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
    <Modal open={open} onClose={handleClose} width={560} ariaLabel="Add document">
      <div style={{ padding: 24 }}>
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
            <Field label="PDF file" help="Up to 4MB. The title is extracted automatically if left blank.">
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
            <Field label="Text" help="Pasted content is chunked and embedded directly.">
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

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'clinical' | 'custom')}
              style={inputStyle}
            >
              <option value="clinical">Clinical</option>
              <option value="custom">Custom</option>
            </select>
          </Field>

          <Field label="Focus area (optional)" help="Tags the document for targeted retrieval.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FOCUS_AREAS.map((f) => {
                const active = focus === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFocus(active ? null : f)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      cursor: 'pointer',
                      background: active ? COLOR.brand : 'rgba(60,20,15,0.06)',
                      color: active ? '#fff' : COLOR.ink,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </Field>

          {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5 }}
              disabled={!canSubmit}
              onClick={submit}
            >
              {busy ? 'Ingesting…' : 'Ingest document'}
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
