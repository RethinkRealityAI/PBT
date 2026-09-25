/**
 * "Upload a document" — the Knowledge step's inline way to bring a new
 * study, protocol or handout into the library AND attach it to this
 * scenario, without leaving the Studio.
 *
 *   1. Choose a PDF (≤ 4 MB) or paste text.
 *   2. "Read it for me" — the tag assistant (`admin-knowledge-analyze`)
 *      proposes a title, topic and citation, with its reasons. Nothing is
 *      written. The admin can skip this and fill the form in themselves.
 *   3. Check the proposal, then "Add to library and attach" — ingested
 *      exactly like the Knowledge screen's Add document does after an
 *      analysis: a PDF the assistant already extracted goes in as TEXT with
 *      its citation (never extracted twice), filed for the training tools
 *      (always including the roleplay customer and the scorer) and, by
 *      default, for this scenario's animal.
 */
import { useRef, useState } from 'react';
import { Modal, ModalCloseButton, StatusPill } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { COLOR } from '../../lib/tokens';
import { ingestKnowledge, type IngestResult } from '../../data/queries';
import { analyzeKnowledge, UPLOAD_CATEGORIES } from '../../data/knowledgeActions';
import {
  MAX_ANALYZE_TEXT_CHARS,
  type KnowledgeAnalysis,
} from '../../../../src/shared/knowledge/knowledgeAnalyze';
import { FOCUS_AREAS, focusAreaLabel, isFocusAreaKey } from '../../../../src/shared/knowledge/focusAreas';
import { KNOWLEDGE_SPECIES, knowledgeToolLabel } from '../../../../src/shared/knowledge/knowledgeScopes';
import type { StudioDraft } from '../studioModel';
import {
  AssistButton,
  Chip,
  FieldBlock,
  Kicker,
  OptionTile,
  TextArea,
  TextInput,
  TypingDots,
  useFieldId,
} from '../ui';
import {
  KNOWLEDGE_CAP,
  draftRetrievalSpecies,
  knowledgeModeOf,
  speciesPlural,
  studioUploadTools,
  toggleSpeciesKey,
  uploadSpeciesDefault,
} from './knowledgeModel';

/** Same cap the server's PDF extraction enforces (`MAX_PDF_BYTES`). */
export const MAX_UPLOAD_PDF_BYTES = 4 * 1024 * 1024;
/** Shorter than this, pasted text isn't worth a model call. */
export const MIN_TEXT_FOR_READING = 200;

type Source = 'pdf' | 'text';
type Phase = 'choose' | 'reading' | 'review';

interface Form {
  title: string;
  focus: string | null;
  category: 'clinical' | 'custom';
  citation: string;
  species: string[];
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('That file couldn’t be read.'));
        return;
      }
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('That file couldn’t be read.'));
    reader.readAsDataURL(file);
  });
}

function confidenceTone(c: number): { label: string; tone: 'success' | 'warn' | 'neutral' } {
  if (c >= 0.8) return { label: 'Confident', tone: 'success' };
  if (c >= 0.5) return { label: 'Fairly sure', tone: 'warn' };
  return { label: 'Not sure — check it', tone: 'neutral' };
}

export function KnowledgeUpload({
  open,
  onClose,
  draft,
  atCap,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  draft: StudioDraft;
  /** The scenario already has the maximum number of documents attached. */
  atCap: boolean;
  /** Ingest succeeded — the parent attaches the slug and refetches. */
  onAdded: (res: IngestResult, title: string) => void;
}) {
  const titleId = useFieldId();
  const textId = useFieldId();
  const fileId = useFieldId();
  const citationId = useFieldId();
  const pasteTitleId = useFieldId();

  const [source, setSource] = useState<Source>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('choose');
  const [analysis, setAnalysis] = useState<KnowledgeAnalysis | null>(null);
  const [extracted, setExtracted] = useState<{ markdown: string | null; citation: string | null }>({
    markdown: null,
    citation: null,
  });
  const [readError, setReadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => blankForm(draft));
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const ticket = useRef(0);

  const scope = draftRetrievalSpecies(draft);
  const mode = knowledgeModeOf(draft);

  function reset() {
    ticket.current += 1;
    setSource('pdf');
    setFile(null);
    setFileError(null);
    setText('');
    setPasteTitle('');
    setPhase('choose');
    setAnalysis(null);
    setExtracted({ markdown: null, citation: null });
    setReadError(null);
    setForm(blankForm(draft));
    setAdding(false);
    setAddError(null);
  }

  function close() {
    if (adding) return;
    reset();
    onClose();
  }

  function pickFile(f: File | null) {
    setFileError(null);
    setReadError(null);
    setAnalysis(null);
    setExtracted({ markdown: null, citation: null });
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_UPLOAD_PDF_BYTES) {
      setFile(null);
      setFileError(
        `That PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB — anything up to 4 MB works. Try a compressed copy, or split it in two.`,
      );
      return;
    }
    setFile(f);
  }

  const trimmedText = text.trim();
  const textTooLong = text.length > MAX_ANALYZE_TEXT_CHARS;
  const hasContent = source === 'pdf' ? file !== null : trimmedText.length > 0 && !textTooLong;
  const canRead =
    source === 'pdf' ? file !== null : trimmedText.length >= MIN_TEXT_FOR_READING && !textTooLong;

  async function read() {
    if (!canRead) return;
    const mine = ++ticket.current;
    setReadError(null);
    setPhase('reading');
    try {
      const res =
        source === 'pdf' && file
          ? await analyzeKnowledge({ pdfBase64: await readFileAsBase64(file) })
          : await analyzeKnowledge({
              text: trimmedText,
              ...(pasteTitle.trim() ? { title: pasteTitle.trim() } : {}),
            });
      if (ticket.current !== mine) return;
      setAnalysis(res.analysis);
      setExtracted({ markdown: res.extractedMarkdown ?? null, citation: res.extractedCitation ?? null });
      setForm(formFromAnalysis(res.analysis, res.extractedCitation ?? null, pasteTitle, draft));
      setPhase('review');
    } catch (err) {
      if (ticket.current !== mine) return;
      setReadError(err instanceof Error ? err.message : 'The assistant didn’t answer.');
      setPhase('choose');
    }
  }

  function fillMyself() {
    setAnalysis(null);
    setForm({
      ...blankForm(draft),
      title: source === 'text' ? pasteTitle.trim() : (file?.name.replace(/\.pdf$/i, '') ?? ''),
    });
    setPhase('review');
  }

  function cancelReading() {
    ticket.current += 1;
    setPhase('choose');
  }

  const speciesExcludesScenario = scope !== undefined && !form.species.includes(scope);
  const formProblem = !form.title.trim()
    ? 'Give the document a title.'
    : form.species.length === 0
      ? 'Pick at least one animal — a document for no animal can never be read.'
      : speciesExcludesScenario
        ? `This scenario is about ${speciesPlural(scope!)} — include ${
            KNOWLEDGE_SPECIES.find((s) => s.key === scope)?.label ?? scope
          } or the AI customer can’t read the document here.`
        : null;
  const canAdd = !adding && !atCap && formProblem === null && hasContent;

  async function add() {
    if (!canAdd) return;
    setAdding(true);
    setAddError(null);
    const title = form.title.trim();
    const tags = {
      ...(form.focus ? { focus: form.focus } : {}),
      tools: studioUploadTools(),
      species: form.species,
    };
    const citation = form.citation.trim() || undefined;
    try {
      let res: IngestResult;
      if (source === 'pdf') {
        if (!file) throw new Error('Choose a PDF first.');
        if (extracted.markdown) {
          // Already extracted by the assistant — send THAT text rather than
          // paying for (and possibly disagreeing with) a second extraction.
          res = await ingestKnowledge({
            text: extracted.markdown,
            title,
            category: form.category,
            tags,
            citation: citation ?? extracted.citation ?? undefined,
          });
        } else {
          res = await ingestKnowledge({
            pdfBase64: await readFileAsBase64(file),
            title,
            category: form.category,
            tags,
            citation,
          });
        }
      } else {
        res = await ingestKnowledge({ text: trimmedText, title, category: form.category, tags, citation });
      }
      setAdding(false);
      onAdded(res, title);
      reset();
      onClose();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'The document couldn’t be added.');
      setAdding(false);
    }
  }

  const clearedTopic = mode === 'focus' && draft.focus_area ? focusAreaLabel(draft.focus_area) : null;

  return (
    <Modal
      open={open}
      onClose={close}
      width={680}
      ariaLabel="Upload a document"
      onRequestClose={() => (adding ? false : undefined)}
    >
      <div
        className="pbt-studio-scroll"
        style={{
          padding: 'clamp(16px, 4vw, 24px)',
          display: 'grid',
          gap: 18,
          overflowY: 'auto',
          // The dialog panel is a capped-height flex column; without these
          // the body can't shrink below its content and never scrolls.
          flex: '1 1 auto',
          minHeight: 0,
        }}
      >
        <div style={{ paddingRight: 44 }}>
          <Kicker>Knowledge</Kicker>
          <h2 style={{ margin: '6px 0 0', fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: COLOR.ink }}>
            Upload a document
          </h2>
          <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
            Add a study, protocol or handout. The assistant reads it and suggests how to file it — you
            check, then it’s added to the library and attached to this scenario.
          </div>
        </div>

        {phase === 'choose' && (
          <>
            <div role="group" aria-label="What are you adding?" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))' }}>
              <OptionTile
                compact
                selected={source === 'pdf'}
                onSelect={() => setSource('pdf')}
                glyph={<span aria-hidden>📄</span>}
                title="A PDF file"
                description="A study or handout, up to 4 MB."
              />
              <OptionTile
                compact
                selected={source === 'text'}
                onSelect={() => setSource('text')}
                glyph={<span aria-hidden>✎</span>}
                title="Paste text"
                description="Notes, a protocol, an article."
              />
            </div>

            {source === 'pdf' ? (
              <FieldBlock
                label="PDF file"
                htmlFor={fileId}
                error={fileError}
                hint={
                  file
                    ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`
                    : 'Up to 4 MB. The title can come from the paper itself.'
                }
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: `1.5px dashed ${file ? COLOR.brand : 'rgba(60,20,15,0.18)'}`,
                    background: file ? 'color-mix(in oklab, oklch(0.55 0.24 22) 5%, white)' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <input
                    id={fileId}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    style={{ fontSize: 13, fontFamily: 'var(--pbt-font)', maxWidth: '100%' }}
                  />
                </div>
              </FieldBlock>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                <FieldBlock
                  label="Title"
                  htmlFor={pasteTitleId}
                  optional
                  hint="Leave it blank and the assistant will suggest one."
                >
                  <TextInput
                    id={pasteTitleId}
                    value={pasteTitle}
                    maxLength={200}
                    placeholder="e.g. Clinic protocol — introducing a urinary diet"
                    onChange={(e) => setPasteTitle(e.target.value)}
                  />
                </FieldBlock>
                <FieldBlock
                  label="The text"
                  htmlFor={textId}
                  count={text.length > 1000 ? { value: text.length, max: MAX_ANALYZE_TEXT_CHARS } : undefined}
                  error={textTooLong ? 'That’s longer than we can take in one go — split it into two documents.' : null}
                  hint={
                    trimmedText.length > 0 && trimmedText.length < MIN_TEXT_FOR_READING
                      ? `A little more (${MIN_TEXT_FOR_READING}+ characters) and the assistant can read it — or fill it in yourself.`
                      : 'Anything the AI should be able to draw on.'
                  }
                >
                  <TextArea
                    id={textId}
                    rows={8}
                    value={text}
                    placeholder="Paste the document text…"
                    onChange={(e) => setText(e.target.value)}
                  />
                </FieldBlock>
              </div>
            )}

            {readError && (
              <InlineAlert tone="error" title="The assistant couldn’t read it">
                {readError} Try again, or fill the details in yourself.
              </InlineAlert>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button tone="ghost" onClick={fillMyself} disabled={!hasContent}>
                Skip — I’ll fill it in myself
              </Button>
              <AssistButton onClick={() => void read()} disabled={!canRead}>
                Read it for me
              </AssistButton>
            </div>
          </>
        )}

        {phase === 'reading' && (
          <div
            role="status"
            style={{
              display: 'grid',
              justifyItems: 'center',
              gap: 10,
              padding: '36px 12px',
              textAlign: 'center',
              color: COLOR.inkSoft,
              fontSize: 13.5,
            }}
          >
            <TypingDots label="Reading your document" />
            <div style={{ fontWeight: 700, color: COLOR.ink }}>Reading your document…</div>
            <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>
              {source === 'pdf' ? 'A PDF takes about 20 seconds.' : 'This takes a few seconds.'}
            </div>
            <Button size="sm" tone="ghost" onClick={cancelReading}>
              Cancel
            </Button>
          </div>
        )}

        {phase === 'review' && (
          <ReviewForm
            analysis={analysis}
            form={form}
            setForm={setForm}
            ids={{ title: titleId, citation: citationId }}
            scope={scope}
          />
        )}

        {phase === 'review' && (
          <>
            {mode !== 'documents' && (
              <InlineAlert tone="info">
                Attaching switches this scenario to <strong>Specific documents</strong>: the AI will read
                only the documents you tick
                {clearedTopic ? `, and the topic “${clearedTopic}” is cleared` : ''}.
              </InlineAlert>
            )}
            {atCap && (
              <InlineAlert tone="warn">
                {KNOWLEDGE_CAP} documents are already attached — the most a scenario can hold. Untick
                one first.
              </InlineAlert>
            )}
            {formProblem && !atCap && (
              <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.14 70)' }}>
                {formProblem}
              </div>
            )}
            {addError && (
              <InlineAlert tone="error" title="It wasn’t added">
                {addError}
              </InlineAlert>
            )}
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
              <span style={{ flex: '1 1 220px', fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
                {adding
                  ? 'Splitting it into sections and making them searchable — usually under a minute.'
                  : 'Everything here can be changed later in Knowledge.'}
              </span>
              <Button onClick={() => setPhase('choose')} disabled={adding}>
                Back
              </Button>
              <Button tone="primary" onClick={() => void add()} disabled={!canAdd} busy={adding}>
                {adding ? 'Adding…' : 'Add to library and attach'}
              </Button>
            </div>
          </>
        )}
      </div>
      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <ModalCloseButton onClose={close} />
      </div>
    </Modal>
  );
}

function blankForm(draft: StudioDraft): Form {
  return {
    title: '',
    focus: null,
    category: 'clinical',
    citation: '',
    species: uploadSpeciesDefault(draft),
  };
}

function formFromAnalysis(
  a: KnowledgeAnalysis,
  extractedCitation: string | null,
  typedTitle: string,
  draft: StudioDraft,
): Form {
  return {
    // A title the admin typed is theirs.
    title: typedTitle.trim() || (a.title ?? '').trim(),
    focus: isFocusAreaKey(a.focus) ? a.focus : null,
    category: a.category === 'custom' ? 'custom' : 'clinical',
    citation: (a.citation ?? extractedCitation ?? '').trim(),
    // The scenario decides the animal; the assistant's view is shown beside it.
    species: uploadSpeciesDefault(draft),
  };
}

function ReviewForm({
  analysis,
  form,
  setForm,
  ids,
  scope,
}: {
  analysis: KnowledgeAnalysis | null;
  form: Form;
  setForm: (f: Form) => void;
  ids: { title: string; citation: string };
  scope: ReturnType<typeof draftRetrievalSpecies>;
}) {
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });
  const confidence = analysis ? confidenceTone(analysis.confidence) : null;
  const toolsLine = studioUploadTools()
    .map((k) => knowledgeToolLabel(k) ?? k)
    .join(' · ');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {analysis && (
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.9), color-mix(in oklab, oklch(0.55 0.18 320) 6%, white))',
            border: '1px solid color-mix(in oklab, oklch(0.55 0.18 320) 18%, transparent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Kicker>What the assistant read</Kicker>
            {confidence && (
              <span style={{ marginLeft: 'auto' }} title={`${Math.round(analysis.confidence * 100)}%`}>
                <StatusPill tone={confidence.tone}>{confidence.label}</StatusPill>
              </span>
            )}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink }}>{analysis.summary}</div>
          {analysis.topics.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {analysis.topics.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'rgba(60,20,15,0.055)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: COLOR.inkSoft,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {analysis.warnings.length > 0 && (
            <InlineAlert tone="warn" title="Worth a second look">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {analysis.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
        </div>
      )}

      <FieldBlock label="Title" htmlFor={ids.title}>
        <TextInput
          id={ids.title}
          value={form.title}
          maxLength={200}
          placeholder="What should this document be called?"
          onChange={(e) => set({ title: e.target.value })}
        />
      </FieldBlock>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Topic</div>
        <div role="group" aria-label="Topic" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip selected={form.focus === null} onClick={() => set({ focus: null })}>
            No particular topic
          </Chip>
          {FOCUS_AREAS.map((f) => (
            <Chip key={f.key} title={f.description} selected={form.focus === f.key} onClick={() => set({ focus: f.key })}>
              {f.label}
            </Chip>
          ))}
        </div>
        {analysis?.reasons.focus && (
          <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 700 }}>Why:</strong> {analysis.reasons.focus}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Kind of document</div>
        <div role="group" aria-label="Kind of document" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {UPLOAD_CATEGORIES.map((c) => (
            <Chip key={c.value} selected={form.category === c.value} onClick={() => set({ category: c.value })}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <FieldBlock
        label="Citation"
        htmlFor={ids.citation}
        optional
        hint="Shown to the AI next to anything it draws from this document."
      >
        <TextInput
          id={ids.citation}
          value={form.citation}
          maxLength={300}
          placeholder="e.g. Davies et al., 2024 — Veterinary Record"
          onChange={(e) => set({ citation: e.target.value })}
        />
      </FieldBlock>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Which animals it’s about</div>
        <div role="group" aria-label="Which animals it’s about" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KNOWLEDGE_SPECIES.map((s) => (
            <Chip
              key={s.key}
              title={s.description}
              selected={form.species.includes(s.key)}
              onClick={() => set({ species: toggleSpeciesKey(form.species, s.key) })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
        <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
          {scope
            ? `Set to match this scenario. A document is only read for the animals ticked here.`
            : 'Every animal, because this scenario doesn’t set a species.'}
          {analysis?.reasons.species ? (
            <>
              {' '}
              <strong style={{ fontWeight: 700 }}>The assistant noted:</strong> {analysis.reasons.species}
            </>
          ) : null}
        </div>
      </div>

      <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 700, color: COLOR.inkSoft }}>Used by:</strong> {toolsLine}.
      </div>
    </div>
  );
}
