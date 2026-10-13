/**
 * The category editor — "+ New category" and "Edit" on the Categories tab,
 * and the same dialog opened from the Pushback and Knowledge steps.
 *
 * A category is a subject area (Probiotics, GI, Obesity & weight loss) and
 * the KNOWLEDGE CONTAINER for every scenario inside it, so the point of this
 * dialog is its Knowledge section: a knowledge topic, the documents its
 * scenarios read (ticked from the library), and "Upload a document", which
 * ingests a new one into the library (the Studio's tag-assistant flow) and
 * attaches it here straight away.
 *
 * Built-in categories can be renamed, described, translated and given
 * knowledge — never deleted (that is the screen's job, and it never offers
 * it for them). Saves carry the version the editor opened
 * (`baseUpdatedAt`; null = a built-in nobody has edited yet), so two admins
 * can't silently overwrite each other.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { useCan } from '../../primitives/access';
import { useConfirm } from '../../primitives/Confirm';
import { useToast } from '../../primitives/Toast';
import { ApiError } from '../../lib/api';
import { COLOR } from '../../lib/tokens';
import type { IngestResult } from '../../data/queries';
import { FOCUS_AREAS } from '../../../../src/shared/knowledge/focusAreas';
import {
  CATEGORY_LIMITS,
  type AdminObjectionCategory,
  type ObjectionCategory,
} from '../../../../src/shared/scenarios/objectionCategories';
import { FieldBlock, TextArea, TextInput } from '../ui';
import { missingKnowledgeSlugs } from '../studioModel';
import type { KnowledgeState } from '../types';
import { DocumentPicker } from '../steps/DocumentPicker';
import { docStatus } from '../steps/knowledgeModel';
import { KnowledgeUpload } from '../steps/KnowledgeUpload';
import { BodyPortal, Disclosure, EditorFrame, selectStyle } from './editorParts';
import {
  categoryAnimals,
  categoryDocReach,
  categoryFormErrors,
  categoryFormToWrite,
  categoryUploadSpecies,
  emptyCategoryForm,
  formFromCategory,
  knowledgeSummaryText,
  toAdminCategory,
  type CategoryForm,
} from './categoriesModel';
import { useObjectionsContext } from './ObjectionsContext';

export interface CategoryEditorProps {
  open: boolean;
  onClose: () => void;
  /** The category to edit; null/undefined = a new one. */
  category?: ObjectionCategory | null;
  /** False for read-only roles: every control disabled, no Save. */
  canWrite: boolean;
  /** The knowledge library (for ticking documents); see `NO_KNOWLEDGE`. */
  knowledge: KnowledgeState;
  /** After a successful save, with the category as the server stored it. */
  onSaved?: (saved: AdminObjectionCategory) => void;
}

/** For a caller without the library (no `knowledge.read`): documents can't be listed. */
export const NO_KNOWLEDGE: KnowledgeState = {
  docs: [],
  loading: false,
  error: 'The knowledge library isn’t available here.',
  refetch: () => {},
};

export function CategoryEditor(props: CategoryEditorProps) {
  const { open, onClose, category } = props;
  const title = !category ? 'New category' : props.canWrite ? 'Edit category' : 'Category';
  // Escape, the scrim and × ask the body first: unsaved edits get a
  // "Close without saving?" instead of vanishing.
  const guard = useRef<() => boolean>(() => true);
  return (
    <Modal open={open} onClose={onClose} onRequestClose={() => guard.current()} width={680} ariaLabel={title}>
      {open && <EditorBody {...props} heading={title} guard={guard} key={category?.id ?? 'new'} />}
    </Modal>
  );
}

function addSlug(list: readonly string[], slug: string): string[] {
  return list.includes(slug) ? [...list] : [...list, slug];
}

function EditorBody({
  onClose,
  category,
  canWrite,
  knowledge,
  onSaved,
  heading,
  guard,
}: CategoryEditorProps & { heading: string; guard: React.MutableRefObject<() => boolean> }) {
  const api = useObjectionsContext();
  const can = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const ids = { name: useId(), nameFr: useId(), description: useId(), topic: useId() };

  const [baseline, setBaseline] = useState<CategoryForm>(() =>
    category ? formFromCategory(category) : emptyCategoryForm(),
  );
  const [form, setForm] = useState<CategoryForm>(baseline);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The version this editor saves over (`baseUpdatedAt`; null = no stored row yet). */
  const [base, setBase] = useState<string | null>(category?.updatedAt ?? null);
  /** Someone else saved it meanwhile; their version (when the server sent it). */
  const [theirs, setTheirs] = useState<ObjectionCategory | null>(null);
  const [frenchOpen, setFrenchOpen] = useState(Boolean(baseline.nameFr));
  const [uploadOpen, setUploadOpen] = useState(false);
  /** Uploaded during this visit: real even before the refetched library lists them. */
  const [recent, setRecent] = useState<string[]>([]);
  const alertRef = useRef<HTMLDivElement | null>(null);

  // A stale save reloads the lists; once the winning version is in, take its
  // token so the next Save goes through (the admin's edits stay on screen).
  const latest = form.id ? api.categories.find((c) => c.id === form.id) ?? null : null;
  const awaitingLatest = useRef(false);
  useEffect(() => {
    if (!awaitingLatest.current || !latest || latest.updatedAt === base) return;
    awaitingLatest.current = false;
    setBase(latest.updatedAt);
    setTheirs(latest);
  }, [latest, base]);

  const errors = categoryFormErrors(form, api.categories);
  const visibleErrors = showErrors ? errors : {};
  const dirty = JSON.stringify(categoryFormToWrite(form)) !== JSON.stringify(categoryFormToWrite(baseline));
  const animals = useMemo(
    () => (form.id ? categoryAnimals(form.id, api.objections) : []),
    [form.id, api.objections],
  );
  const canUpload = canWrite && can('knowledge.write');
  const docsReady = !knowledge.loading && !knowledge.error;
  const missing = docsReady
    ? missingKnowledgeSlugs(form.knowledgeSlugs, [...knowledge.docs.map((d) => d.slug), ...recent])
    : [];
  const atCap = form.knowledgeSlugs.length >= CATEGORY_LIMITS.knowledgeSlugsMax;
  // Only what the AI customer may read is worth ticking here (Fecal Scan
  // charts and other tool-only documents are left out) — but anything
  // already attached stays listed so it can be unticked.
  const roleplayDocs = useMemo(
    () => knowledge.docs.filter((d) => docStatus(d, undefined).usedByRoleplay || form.knowledgeSlugs.includes(d.slug)),
    [knowledge.docs, form.knowledgeSlugs],
  );
  const hiddenDocs = knowledge.docs.length - roleplayDocs.length;
  // Attached documents that won't reach every scenario here (another
  // animal, or not read by the roleplay / scoring) — said up front, since
  // those scenarios quietly read the whole library instead.
  const reachGaps = useMemo(
    () =>
      form.knowledgeSlugs.flatMap((slug) => {
        const doc = knowledge.docs.find((d) => d.slug === slug);
        if (!doc) return [];
        const problems = categoryDocReach(doc, animals);
        return problems.length ? [{ slug, title: doc.title || slug, problems }] : [];
      }),
    [form.knowledgeSlugs, knowledge.docs, animals],
  );
  const summary = knowledgeSummaryText(form);
  const name = form.name.trim() || 'this category';

  function update(p: Partial<CategoryForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  guard.current = () => {
    if (busy) return false;
    if (canWrite && dirty) {
      void requestClose();
      return false;
    }
    return true;
  };

  async function requestClose() {
    if (busy) return;
    if (canWrite && dirty) {
      const ok = await confirm({
        title: 'Close without saving?',
        body: 'Your changes to this category haven’t been saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }

  function explain(err: unknown): string {
    if (err instanceof ApiError && err.code === 'stale') {
      const current = toAdminCategory(err.body.current);
      if (current) {
        setBase(current.updatedAt);
        setTheirs(current);
      } else {
        awaitingLatest.current = true;
      }
      return 'Someone else changed this category while you were editing. Your changes are still here — check them against their version, then save again.';
    }
    if (err instanceof ApiError && err.code === 'limit') {
      return `Your team already has the most categories allowed (${CATEGORY_LIMITS.maxTeamCategories}). Delete one you no longer use first.`;
    }
    if (err instanceof ApiError && err.status === 503) {
      return 'Categories need a database update before they can be saved. Everything else keeps working meanwhile.';
    }
    return err instanceof Error && err.message ? err.message : 'The save didn’t go through.';
  }

  async function save() {
    if (!canWrite || busy) return;
    setShowErrors(true);
    if (Object.keys(errors).length > 0) {
      setError(null);
      window.setTimeout(() => alertRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { category: saved, dropped } = await api.saveCategory(
        categoryFormToWrite(form),
        form.id ? base : undefined,
      );
      toast({
        message: form.id ? `Saved “${saved.name}”.` : `“${saved.name}” added — add its objections next.`,
        tone: 'success',
      });
      if (dropped.length > 0) {
        toast({
          tone: 'info',
          message: `${dropped.length === 1 ? 'One document wasn’t' : `${dropped.length} documents weren’t`} attached because ${
            dropped.length === 1 ? 'it’s' : 'they’re'
          } no longer in the library: ${dropped.join(', ')}.`,
        });
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(explain(err));
      window.setTimeout(() => alertRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  /**
   * A document uploaded from here is attached at once: for a category that
   * already exists the attachment is SAVED straight away (on top of the
   * stored version, so the admin's other unsaved edits stay theirs to save);
   * a new category takes it with its first save.
   */
  async function onUploaded(res: IngestResult, title: string) {
    setRecent((r) => (r.includes(res.slug) ? r : [...r, res.slug]));
    setForm((f) => ({ ...f, knowledgeSlugs: addSlug(f.knowledgeSlugs, res.slug) }));
    knowledge.refetch();
    const indexNote =
      res.chunks === 0
        ? ' It isn’t searchable yet — rebuild its search index in Knowledge.'
        : (res.failures?.length ?? 0) > 0
          ? ` ${res.failures!.length} section${res.failures!.length === 1 ? '' : 's'} couldn’t be indexed; rebuild its search index in Knowledge.`
          : '';
    const stored = form.id ? (api.categories.find((c) => c.id === form.id) ?? category ?? null) : null;
    if (!form.id || !stored) {
      toast({
        tone: 'success',
        message: `“${title}” is in the library — it’s attached when you add this category.${indexNote}`,
      });
      return;
    }
    try {
      const write = categoryFormToWrite({
        ...formFromCategory(stored),
        knowledgeSlugs: addSlug(stored.knowledgeSlugs, res.slug),
      });
      const { category: saved } = await api.saveCategory(write, base);
      setBase(saved.updatedAt);
      setBaseline((b) => ({ ...b, knowledgeSlugs: addSlug(b.knowledgeSlugs, res.slug) }));
      toast({
        tone: indexNote ? 'info' : 'success',
        message: `“${title}” is in the library and attached to “${saved.name}”.${indexNote}`,
      });
    } catch (err) {
      setError(`“${title}” is in the library, but attaching it didn’t save yet — ${explain(err)} Press Save to keep it attached.`);
    }
  }

  const generalError = visibleErrors.general ?? null;
  const fieldErrorCount = Object.keys(visibleErrors).filter((k) => k !== 'general').length;
  const scope = animals.length === 1 && animals[0] === 'cat' ? ('cat' as const) : undefined;

  return (
    <EditorFrame
      kicker="Category"
      heading={heading}
      sub={category ? (category.builtIn ? `${category.name} · built in` : category.name) : undefined}
      onClose={onClose}
      footer={
        canWrite ? (
          <>
            <Button tone="ghost" onClick={() => void requestClose()} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" busy={busy} onClick={() => void save()}>
              {category ? 'Save changes' : 'Add category'}
            </Button>
          </>
        ) : (
          <Button tone="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div ref={alertRef} tabIndex={-1} style={{ outline: 'none', display: 'grid', gap: 8 }}>
        {error && (
          <InlineAlert tone="error" title="Not saved">
            <div>{error}</div>
            {theirs && (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div>
                  Their version: <strong>“{theirs.name}”</strong>
                  {knowledgeSummaryText(theirs) ? ` — ${knowledgeSummaryText(theirs)}` : ''}.
                </div>
                <div>
                  <Button
                    size="sm"
                    tone="secondary"
                    onClick={() => {
                      setForm(formFromCategory(theirs));
                      setError(null);
                    }}
                  >
                    Use their version instead
                  </Button>
                </div>
              </div>
            )}
          </InlineAlert>
        )}
        {showErrors && (fieldErrorCount > 0 || generalError) && (
          <InlineAlert tone="error" title="A few things to fix before saving">
            {generalError ?? 'They’re marked below.'}
          </InlineAlert>
        )}
      </div>

      <FieldBlock
        label="Name"
        htmlFor={ids.name}
        count={{ value: form.name.trim().length, max: CATEGORY_LIMITS.nameMax }}
        hint={
          form.builtIn
            ? 'Built in — you can rename it and attach knowledge, but it can’t be deleted.'
            : 'The subject, in a word or two — e.g. Probiotics. Trainees see it when they pick an objection.'
        }
        error={visibleErrors.name}
      >
        <TextInput
          id={ids.name}
          value={form.name}
          disabled={!canWrite}
          maxLength={CATEGORY_LIMITS.nameMax + 20}
          placeholder="e.g. Probiotics"
          onChange={(e) => update({ name: e.target.value })}
        />
      </FieldBlock>

      <FieldBlock
        label="Description"
        htmlFor={ids.description}
        optional
        count={{ value: form.description.trim().length, max: CATEGORY_LIMITS.descriptionMax }}
        hint="One plain sentence: what this subject covers."
        error={visibleErrors.description}
      >
        <TextArea
          id={ids.description}
          rows={2}
          value={form.description}
          disabled={!canWrite}
          placeholder="e.g. Owners who doubt a daily probiotic — or think yogurt does the same job."
          onChange={(e) => update({ description: e.target.value })}
          style={{ minHeight: 64 }}
        />
      </FieldBlock>

      <Disclosure
        title="French version"
        note="Optional — English is shown when it’s empty."
        open={frenchOpen}
        onToggle={() => setFrenchOpen((v) => !v)}
      >
        <FieldBlock
          label="Name in French"
          htmlFor={ids.nameFr}
          optional
          count={{ value: form.nameFr.trim().length, max: CATEGORY_LIMITS.nameMax }}
          error={visibleErrors.nameFr}
        >
          <TextInput
            id={ids.nameFr}
            lang="fr-CA"
            value={form.nameFr}
            disabled={!canWrite}
            placeholder="e.g. Probiotiques"
            onChange={(e) => update({ nameFr: e.target.value })}
          />
        </FieldBlock>
      </Disclosure>

      <section
        aria-labelledby={`${ids.topic}-heading`}
        style={{
          display: 'grid',
          gap: 14,
          padding: '16px clamp(12px, 3vw, 16px)',
          borderRadius: 16,
          border: `1px solid ${COLOR.border}`,
          background: 'rgba(255,255,255,0.6)',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <h3 id={`${ids.topic}-heading`} style={{ margin: 0, fontSize: 15, fontWeight: 750, color: COLOR.ink }}>
            Knowledge
          </h3>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
            Every scenario on an objection in {form.name.trim() ? `“${form.name.trim()}”` : 'this category'} reads
            this — unless a scenario picks its own on its Knowledge step.
          </div>
        </div>

        <FieldBlock
          label="Knowledge topic"
          htmlFor={ids.topic}
          optional
          hint="Narrows the search to documents filed under one topic. New uploads here are filed under it too."
        >
          <select
            id={ids.topic}
            className="pbt-studio-field"
            value={form.focusArea ?? ''}
            disabled={!canWrite}
            onChange={(e) => update({ focusArea: e.target.value || null })}
            style={selectStyle}
          >
            <option value="">No specific topic</option>
            {FOCUS_AREAS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </FieldBlock>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 220px', fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
              Documents this category’s scenarios read
            </span>
            {canWrite &&
              (canUpload ? (
                <Button
                  size="sm"
                  tone="secondary"
                  onClick={() => setUploadOpen(true)}
                  disabled={atCap}
                  title={atCap ? `${CATEGORY_LIMITS.knowledgeSlugsMax} documents are already attached` : undefined}
                >
                  <Upload aria-hidden size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                  Upload a document
                </Button>
              ) : (
                <span style={{ fontSize: 12, color: COLOR.inkMute, maxWidth: 260, lineHeight: 1.45 }}>
                  Uploading needs the Edit knowledge base permission — tick documents already in the library.
                </span>
              ))}
          </div>

          {knowledge.error ? (
            <InlineAlert tone="info" title="The library can’t be listed here">
              {knowledge.error}{' '}
              {form.knowledgeSlugs.length === 1
                ? '1 document is attached — it stays attached.'
                : form.knowledgeSlugs.length > 1
                  ? `${form.knowledgeSlugs.length} documents are attached — they stay attached.`
                  : ''}
            </InlineAlert>
          ) : (
            <DocumentPicker
              docs={roleplayDocs}
              loading={knowledge.loading}
              selected={form.knowledgeSlugs}
              missing={missing}
              scope={scope}
              canWrite={canWrite}
              canUpload={canUpload}
              holder="category"
              onChange={(next) => update({ knowledgeSlugs: next ?? [] })}
            />
          )}
          {!knowledge.error && reachGaps.length > 0 && (
            <InlineAlert tone="warn" title="Not every scenario here can read these">
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {reachGaps.map((g) => (
                  <li key={g.slug}>
                    <strong>{g.title}</strong>: {g.problems.join(' ')}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>Widen its animals or “Used by” in Knowledge to fix it.</div>
            </InlineAlert>
          )}
          {!knowledge.error && hiddenDocs > 0 && (
            <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
              {hiddenDocs} document{hiddenDocs === 1 ? ' isn’t' : 's aren’t'} listed because the AI customer
              doesn’t read {hiddenDocs === 1 ? 'it' : 'them'} (for example the Fecal Scan charts).
            </div>
          )}
          {visibleErrors.knowledge && (
            <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: COLOR.danger }}>
              {visibleErrors.knowledge}
            </div>
          )}
        </div>

        <div
          role="status"
          style={{
            padding: '9px 12px',
            borderRadius: 12,
            background: COLOR.infoSoft,
            color: 'oklch(0.40 0.13 245)',
            fontSize: 12.5,
            fontWeight: 650,
            lineHeight: 1.5,
          }}
        >
          {summary
            ? `Scenarios in ${name === 'this category' ? name : `“${name}”`} read: ${summary}.`
            : `Nothing attached — scenarios in ${name === 'this category' ? name : `“${name}”`} read the whole library.`}
          {form.knowledgeSlugs.length > 0 && form.focusArea
            ? ' With documents ticked, they read only those; the topic is used for new uploads.'
            : ''}
        </div>
      </section>

      {canUpload && (
        <BodyPortal>
          <KnowledgeUpload
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            forCategory={{
              name: form.name.trim() || 'this category',
              focus: form.focusArea,
              species: categoryUploadSpecies(animals),
            }}
            atCap={atCap}
            onAdded={(res, title) => void onUploaded(res, title)}
          />
        </BodyPortal>
      )}
    </EditorFrame>
  );
}
