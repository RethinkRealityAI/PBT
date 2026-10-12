/**
 * The objection editor — "+ New objection" on the Objections tab and on the
 * Pushback step, and "Edit" on a team objection.
 *
 * A dialog (the shared `Modal`: focus trap, Escape, scrim), full width on a
 * phone. Name and the owner's line are required; the animals decide where it
 * is offered; the knowledge topic decides what the AI reads; French text and
 * coaching are optional and folded away. The server validates again and
 * allocates the id; a save carries the version the editor opened
 * (`baseUpdatedAt`) so two admins can't silently overwrite each other.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, ModalCloseButton } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { useConfirm } from '../../primitives/Confirm';
import { useToast } from '../../primitives/Toast';
import { ApiError } from '../../lib/api';
import { COLOR } from '../../lib/tokens';
import {
  COACHING_KEYS,
  COACHING_LABELS,
  OBJECTION_LIMITS,
  type AdminObjection,
  type TeamObjection,
} from '../../../../src/shared/scenarios/objections';
import { FOCUS_AREAS } from '../../../../src/shared/knowledge/focusAreas';
import type { ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { Chip, FieldBlock, Kicker, TextArea, TextInput } from '../ui';
import {
  coachingLines,
  emptyObjectionForm,
  formFromObjection,
  formToWrite,
  objectionFormErrors,
  toAdminObjection,
  type ObjectionForm,
} from './objectionsModel';
import { useObjectionsContext } from './ObjectionsContext';

export interface ObjectionEditorProps {
  open: boolean;
  onClose: () => void;
  /** The objection to edit; null/undefined = a new one. */
  objection?: TeamObjection | null;
  /** Animals a NEW objection starts with (the scenario's species on the Pushback step). */
  defaultSpecies?: readonly ScenarioSpecies[] | null;
  /** False for read-only roles: every control disabled, no Save. */
  canWrite: boolean;
  /** After a successful save, with the objection as the server stored it. */
  onSaved?: (saved: AdminObjection) => void;
}

export function ObjectionEditor(props: ObjectionEditorProps) {
  const { open, onClose, objection } = props;
  const isNew = !objection;
  const title = isNew ? 'New objection' : props.canWrite ? 'Edit objection' : 'Objection';
  // Escape, the scrim and × all ask the body first: unsaved edits get a
  // "Close without saving?" instead of vanishing.
  const guard = useRef<() => boolean>(() => true);
  return (
    <Modal open={open} onClose={onClose} onRequestClose={() => guard.current()} width={640} ariaLabel={title}>
      {open && <EditorBody {...props} heading={title} guard={guard} key={objection?.id ?? 'new'} />}
    </Modal>
  );
}

const SPECIES_CHOICES: Array<{ value: ScenarioSpecies; label: string; glyph: string }> = [
  { value: 'dog', label: 'Dogs', glyph: '🐕' },
  { value: 'cat', label: 'Cats', glyph: '🐈' },
];

function EditorBody({
  onClose,
  objection,
  defaultSpecies,
  canWrite,
  onSaved,
  heading,
  guard,
}: ObjectionEditorProps & { heading: string; guard: React.MutableRefObject<() => boolean> }) {
  const api = useObjectionsContext();
  const toast = useToast();
  const confirm = useConfirm();
  const ids = {
    title: useId(),
    example: useId(),
    topic: useId(),
    titleFr: useId(),
    exampleFr: useId(),
    animals: useId(),
    active: useId(),
  };

  const initial = useMemo<ObjectionForm>(
    () => (objection ? formFromObjection(objection) : emptyObjectionForm(defaultSpecies)),
    // Opened once per objection (the body is keyed on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [form, setForm] = useState<ObjectionForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The version this editor saves over (`baseUpdatedAt`). */
  const [base, setBase] = useState<string | null>(objection?.updatedAt ?? null);
  /** Someone else saved it meanwhile; their version (when the server sent it). */
  const [theirs, setTheirs] = useState<TeamObjection | null>(null);
  const [frenchOpen, setFrenchOpen] = useState(Boolean(initial.titleFr || initial.exampleFr));
  const [coachingOpen, setCoachingOpen] = useState(
    COACHING_KEYS.some((k) => initial.coaching[k].trim() !== ''),
  );
  const alertRef = useRef<HTMLDivElement | null>(null);

  // A stale save reloads the list; once the winning version is in, take its
  // token so the next Save goes through (the admin's edits stay on screen).
  const latest = form.id ? api.objections.find((o) => o.id === form.id) ?? null : null;
  const awaitingLatest = useRef(false);
  useEffect(() => {
    if (!awaitingLatest.current || !latest || latest.updatedAt === base) return;
    awaitingLatest.current = false;
    setBase(latest.updatedAt);
    setTheirs(latest);
  }, [latest, base]);

  const errors = objectionFormErrors(form);
  const visibleErrors = showErrors ? errors : {};
  const dirty = JSON.stringify(formToWrite(form)) !== JSON.stringify(formToWrite(initial));

  function update(p: Partial<ObjectionForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function toggleSpecies(s: ScenarioSpecies) {
    setForm((f) => ({
      ...f,
      species: f.species.includes(s) ? f.species.filter((x) => x !== s) : [...f.species, s],
    }));
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
        body: 'Your changes to this objection haven’t been saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
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
      const saved = await api.save(formToWrite(form), form.id ? base : undefined);
      toast({
        message: form.id ? `Saved “${saved.title}”.` : `“${saved.title}” added — it’s ready to use in scenarios.`,
        tone: 'success',
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale') {
        const current = toAdminObjection(err.body.current);
        if (current) {
          setBase(current.updatedAt);
          setTheirs(current);
        } else {
          awaitingLatest.current = true;
        }
        setError(
          'Someone else changed this objection while you were editing. Your changes are still here — check them against their version, then save again.',
        );
      } else if (err instanceof ApiError && err.status === 503) {
        setError(
          'Objections need a database update before they can be saved. The built-in objections still work meanwhile.',
        );
      } else {
        setError(err instanceof Error && err.message ? err.message : 'The save didn’t go through.');
      }
      window.setTimeout(() => alertRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  const generalError = visibleErrors.general ?? null;
  const fieldErrorCount = Object.keys(visibleErrors).filter((k) => k !== 'general').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh', minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '18px 18px 12px 20px',
          borderBottom: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Kicker>Objection</Kicker>
          <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.02em' }}>
            {heading}
          </h2>
          {objection && (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 2, overflowWrap: 'anywhere' }}>
              {objection.title}
            </div>
          )}
        </div>
        <span style={{ flexShrink: 0 }}>
          <ModalCloseButton onClose={onClose} />
        </span>
      </div>

      {/* Body */}
      <div className="pbt-studio-scroll" style={{ overflowY: 'auto', padding: '16px 20px 20px', display: 'grid', gap: 18 }}>
        <div ref={alertRef} tabIndex={-1} style={{ outline: 'none', display: 'grid', gap: 8 }}>
          {error && (
            <InlineAlert tone="error" title="Not saved">
              <div>{error}</div>
              {theirs && (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <div>
                    Their version: <strong>“{theirs.title}”</strong>
                    {theirs.visible ? '' : ' (retired)'}.
                  </div>
                  <div>
                    <Button
                      size="sm"
                      tone="secondary"
                      onClick={() => {
                        setForm(formFromObjection(theirs));
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
          htmlFor={ids.title}
          count={{ value: form.title.trim().length, max: OBJECTION_LIMITS.titleMax }}
          hint="Short and specific — e.g. Probiotics: “my dog doesn’t need them”. Trainees see this name."
          error={visibleErrors.title}
        >
          <TextInput
            id={ids.title}
            value={form.title}
            disabled={!canWrite}
            maxLength={OBJECTION_LIMITS.titleMax + 20}
            placeholder="e.g. Probiotics: “my dog doesn’t need them”"
            onChange={(e) => update({ title: e.target.value })}
          />
        </FieldBlock>

        <FieldBlock
          label="What an owner typically says"
          htmlFor={ids.example}
          count={{ value: form.example.trim().length, max: OBJECTION_LIMITS.exampleMax }}
          hint="One line in the owner’s voice. It’s shown when picking the objection, and the AI owner starts from it."
          error={visibleErrors.example}
        >
          <TextArea
            id={ids.example}
            rows={2}
            value={form.example}
            disabled={!canWrite}
            placeholder="e.g. “He eats a good food already — why would he need probiotics?”"
            onChange={(e) => update({ example: e.target.value })}
            style={{ minHeight: 64 }}
          />
        </FieldBlock>

        <div role="group" aria-labelledby={ids.animals} style={{ display: 'grid', gap: 6 }}>
          <span id={ids.animals} style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
            Animals
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SPECIES_CHOICES.map((s) => (
              <Chip
                key={s.value}
                selected={form.species.includes(s.value)}
                disabled={!canWrite}
                onClick={() => toggleSpecies(s.value)}
              >
                <span aria-hidden style={{ marginRight: 6 }}>
                  {s.glyph}
                </span>
                {s.label}
              </Chip>
            ))}
          </div>
          {visibleErrors.species ? (
            <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: COLOR.danger }}>
              {visibleErrors.species}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
              It’s offered only for scenarios about these animals — in the Studio and in the trainee
              app’s builder.
            </div>
          )}
        </div>

        <FieldBlock
          label="Knowledge topic"
          htmlFor={ids.topic}
          hint="Scenarios on this objection read the documents filed under this topic. Probiotics fit under Digestive health (GI)."
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

        <Disclosure
          title="French version"
          note="Optional — English is shown when it’s empty."
          open={frenchOpen}
          onToggle={() => setFrenchOpen((v) => !v)}
        >
          <FieldBlock
            label="Name in French"
            htmlFor={ids.titleFr}
            optional
            count={{ value: form.titleFr.trim().length, max: OBJECTION_LIMITS.titleMax }}
            error={visibleErrors.titleFr}
          >
            <TextInput
              id={ids.titleFr}
              lang="fr-CA"
              value={form.titleFr}
              disabled={!canWrite}
              onChange={(e) => update({ titleFr: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock
            label="What an owner typically says, in French"
            htmlFor={ids.exampleFr}
            optional
            count={{ value: form.exampleFr.trim().length, max: OBJECTION_LIMITS.exampleMax }}
            error={visibleErrors.exampleFr}
          >
            <TextArea
              id={ids.exampleFr}
              lang="fr-CA"
              rows={2}
              value={form.exampleFr}
              disabled={!canWrite}
              onChange={(e) => update({ exampleFr: e.target.value })}
              style={{ minHeight: 64 }}
            />
          </FieldBlock>
        </Disclosure>

        <Disclosure
          title="Coaching"
          note="Optional — makes the AI owner and the trainee hints sharper."
          open={coachingOpen}
          onToggle={() => setCoachingOpen((v) => !v)}
        >
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
            One idea per line, up to {OBJECTION_LIMITS.coachingItems} per box. The AI owner reveals
            <strong> what they’re really worried about</strong> only when the trainee asks good
            questions; the other boxes show up as hints for the trainee.
          </div>
          {COACHING_KEYS.map((key) => (
            <CoachingBox
              key={key}
              label={COACHING_LABELS[key].label}
              help={COACHING_LABELS[key].help}
              value={form.coaching[key]}
              disabled={!canWrite}
              error={visibleErrors[key]}
              onChange={(v) => update({ coaching: { ...form.coaching, [key]: v } })}
            />
          ))}
        </Disclosure>

        <label
          htmlFor={ids.active}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(60,20,15,0.035)',
            border: `1px solid ${COLOR.borderSoft}`,
            cursor: canWrite ? 'pointer' : 'default',
          }}
        >
          <input
            id={ids.active}
            type="checkbox"
            checked={form.visible}
            disabled={!canWrite}
            onChange={(e) => update({ visible: e.target.checked })}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: COLOR.brand }}
          />
          <span style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink }}>Active</span>
            <span style={{ fontSize: 12.5, color: COLOR.inkMute, lineHeight: 1.45 }}>
              {form.visible
                ? 'Offered when anyone builds a scenario.'
                : 'Retired — hidden when building scenarios. Scenarios that already use it keep working.'}
            </span>
          </span>
        </label>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '12px 20px 16px',
          borderTop: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        {canWrite ? (
          <>
            <Button tone="ghost" onClick={() => void requestClose()} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" busy={busy} onClick={() => void save()}>
              {objection ? 'Save changes' : 'Add objection'}
            </Button>
          </>
        ) : (
          <Button tone="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.78)',
  fontSize: 14,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

function Disclosure({
  title,
  note,
  open,
  onToggle,
  children,
}: {
  title: string;
  note: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${COLOR.borderSoft}`, background: 'rgba(255,255,255,0.55)' }}>
      <button
        type="button"
        className="pbt-focusable"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          padding: '12px 14px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--pbt-font)',
          borderRadius: 14,
        }}
      >
        <span aria-hidden style={{ fontSize: 11, color: COLOR.inkMute, transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>
          ▶
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 750, color: COLOR.ink }}>{title}</span>
        <span style={{ fontSize: 12, color: COLOR.inkMute }}>{note}</span>
      </button>
      {open && (
        <div id={panelId} style={{ padding: '2px 14px 14px', display: 'grid', gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function CoachingBox({
  label,
  help,
  value,
  disabled,
  error,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const lines = coachingLines(value).length;
  return (
    <FieldBlock
      label={label}
      htmlFor={id}
      optional
      count={{ value: lines, max: OBJECTION_LIMITS.coachingItems }}
      hint={help}
      error={error}
    >
      <TextArea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        placeholder="One per line"
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight: 72, fontSize: 13.5 }}
      />
    </FieldBlock>
  );
}
