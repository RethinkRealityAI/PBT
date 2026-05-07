import { useMemo, useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { EmptyState, LoadingShimmer, SectionTitle, StatusPill } from '../primitives';
import { COLOR } from '../lib/tokens';
import {
  deleteScenarioOverride,
  upsertScenarioOverride,
  useScenarioOverrides,
  useUserScenarios,
} from '../data/queries';
import type { ScenarioOverrideRow } from '../data/types';
import { LIBRARY_MANIFEST } from '../data/scenarioManifest';
import {
  Field,
  ModalShell,
  btnPrimary,
  btnSecondary,
  inputStyle,
  textareaStyle,
} from './FlagsScreen';

const PROMPT_MAX = 1500;

interface OverridableScenario {
  id: string;
  title: string;
  source: 'library' | 'user';
  breed: string | null;
}

export function ScenarioOverridesScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const overrides = useScenarioOverrides(refreshKey);
  const userScenarios = useUserScenarios(500);
  const [editing, setEditing] = useState<{
    scenario: OverridableScenario;
    override: ScenarioOverrideRow | null;
  } | null>(null);

  const all = useMemo<OverridableScenario[]>(
    () => [
      ...LIBRARY_MANIFEST.map((s) => ({
        id: s.id,
        title: s.title,
        source: 'library' as const,
        breed: s.breed,
      })),
      ...userScenarios.data.map((s) => ({
        id: `user:${s.id}`,
        title: s.title,
        source: 'user' as const,
        breed: s.breed,
      })),
    ],
    [userScenarios.data],
  );

  const overrideById = useMemo(() => {
    const m = new Map<string, ScenarioOverrideRow>();
    for (const o of overrides.data) m.set(o.scenario_id, o);
    return m;
  }, [overrides.data]);

  const filtered = useMemo(() => {
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter((s) =>
      `${s.id} ${s.title} ${s.breed ?? ''}`.toLowerCase().includes(q),
    );
  }, [all, query]);

  return (
    <>
      <ContextBar
        title="Scenario overrides"
        subtitle="Hide / reorder library scenarios. Apply bounded AI prompt prefixes & suffixes. Scoring rubric stays canonical."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <Glass padding={20} radius={20}>
          <SectionTitle
            title="Library + user-built scenarios"
            subtitle={`${overrideById.size} of ${all.length} have overrides`}
          />
          {overrides.loading || userScenarios.loading ? (
            <LoadingShimmer height={180} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No scenarios match" />
          ) : (
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              {filtered.map((s) => {
                const o = overrideById.get(s.id) ?? null;
                return (
                  <div
                    key={s.id}
                    onClick={() => setEditing({ scenario: s, override: o })}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.55)',
                      border: '0.5px solid rgba(255,255,255,0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <StatusPill tone={s.source === 'library' ? 'info' : 'neutral'}>
                      {s.source === 'library' ? 'Library' : 'User'}
                    </StatusPill>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                        {s.title}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--pbt-mono)',
                          fontSize: 11,
                          color: COLOR.inkMute,
                          marginTop: 2,
                        }}
                      >
                        {s.id} · {s.breed ?? '—'}
                      </div>
                    </div>
                    {o && <OverrideSummaryPill override={o} />}
                  </div>
                );
              })}
            </div>
          )}
        </Glass>
      </ScreenShell>
      {editing && (
        <OverrideEditorModal
          scenario={editing.scenario}
          override={editing.override}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function OverrideSummaryPill({ override }: { override: ScenarioOverrideRow }) {
  const bits: string[] = [];
  if (!override.visible) bits.push('hidden');
  if (override.sort_order != null) bits.push(`#${override.sort_order}`);
  if (override.prompt_prefix || override.prompt_suffix) bits.push('AI override');
  if (override.difficulty_override != null)
    bits.push(`difficulty ${override.difficulty_override}`);
  return (
    <StatusPill tone={!override.visible ? 'warn' : 'success'}>
      {bits.length ? bits.join(' · ') : 'overridden'}
    </StatusPill>
  );
}

function OverrideEditorModal({
  scenario,
  override,
  onClose,
  onSaved,
}: {
  scenario: OverridableScenario;
  override: ScenarioOverrideRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visible, setVisible] = useState(override?.visible ?? true);
  const [sortOrder, setSortOrder] = useState<number | ''>(
    override?.sort_order ?? '',
  );
  const [titleOverride, setTitleOverride] = useState(override?.title_override ?? '');
  const [contextOverride, setContextOverride] = useState(
    override?.context_override ?? '',
  );
  const [openingOverride, setOpeningOverride] = useState(
    override?.opening_line_override ?? '',
  );
  const [difficultyOverride, setDifficultyOverride] = useState<number | ''>(
    override?.difficulty_override ?? '',
  );
  const [personaOverride, setPersonaOverride] = useState(
    override?.persona_override ?? '',
  );
  const [promptPrefix, setPromptPrefix] = useState(override?.prompt_prefix ?? '');
  const [promptSuffix, setPromptSuffix] = useState(override?.prompt_suffix ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (promptPrefix.length > PROMPT_MAX || promptSuffix.length > PROMPT_MAX) {
        throw new Error(`Prompt overrides must be ≤ ${PROMPT_MAX} chars.`);
      }
      await upsertScenarioOverride({
        scenario_id: scenario.id,
        visible,
        sort_order: sortOrder === '' ? null : sortOrder,
        title_override: titleOverride.trim() || null,
        context_override: contextOverride.trim() || null,
        opening_line_override: openingOverride.trim() || null,
        difficulty_override: difficultyOverride === '' ? null : difficultyOverride,
        persona_override: personaOverride.trim() || null,
        prompt_prefix: promptPrefix.trim() || null,
        prompt_suffix: promptSuffix.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    if (!override) return;
    if (!confirm('Remove all overrides for this scenario?')) return;
    setSaving(true);
    try {
      await deleteScenarioOverride(scenario.id);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={scenario.title}
      onClose={onClose}
      width={620}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(60,20,15,0.04)',
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            color: COLOR.inkMute,
          }}
        >
          {scenario.id}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Visible">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              {visible ? 'Shown in app' : 'Hidden'}
            </label>
          </Field>
          <Field label="Sort order" help="Lower number first. Empty = default order.">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value === '' ? '' : Number(e.target.value))
              }
              style={inputStyle}
              placeholder="—"
            />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Difficulty override" help="1–4. Empty = use scenario default.">
            <input
              type="number"
              min={1}
              max={4}
              value={difficultyOverride}
              onChange={(e) =>
                setDifficultyOverride(
                  e.target.value === '' ? '' : Number(e.target.value),
                )
              }
              style={inputStyle}
              placeholder="—"
            />
          </Field>
          <Field label="Persona override">
            <input
              value={personaOverride}
              onChange={(e) => setPersonaOverride(e.target.value)}
              placeholder="Skeptical | Anxious | Busy | …"
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Opening line override">
          <textarea
            value={openingOverride}
            onChange={(e) => setOpeningOverride(e.target.value)}
            rows={2}
            style={textareaStyle}
          />
        </Field>
        <Field label="Context override">
          <textarea
            value={contextOverride}
            onChange={(e) => setContextOverride(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </Field>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(245, 200, 90, 0.18)',
            border: '0.5px solid rgba(245, 200, 90, 0.4)',
            fontSize: 12,
            color: COLOR.ink,
            lineHeight: 1.5,
          }}
        >
          <strong>AI prompt overrides</strong> wrap the canonical customer
          prompt. The 7-dimension scoring rubric is never overridden — clinical
          accuracy is preserved regardless. Each field is capped at {PROMPT_MAX} chars.
        </div>
        <Field
          label={`Prompt prefix (${promptPrefix.length}/${PROMPT_MAX})`}
          help="Inserted at the very start of the customer system prompt."
        >
          <textarea
            value={promptPrefix}
            onChange={(e) => setPromptPrefix(e.target.value)}
            rows={4}
            maxLength={PROMPT_MAX}
            style={textareaStyle}
          />
        </Field>
        <Field
          label={`Prompt suffix (${promptSuffix.length}/${PROMPT_MAX})`}
          help="Appended after the rules block."
        >
          <textarea
            value={promptSuffix}
            onChange={(e) => setPromptSuffix(e.target.value)}
            rows={4}
            maxLength={PROMPT_MAX}
            style={textareaStyle}
          />
        </Field>
        {error && (
          <div style={{ color: COLOR.danger, fontSize: 12 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {override ? (
            <button onClick={clearOverride} style={{ ...btnSecondary, color: COLOR.danger }}>
              Remove all overrides
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? 'Saving…' : 'Save overrides'}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
