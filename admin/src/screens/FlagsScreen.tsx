import { useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  Eyebrow,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { Glass } from '../primitives/Glass';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { useConfirm } from '../primitives/Confirm';
import {
  Field,
  btnPrimary,
  btnSecondary,
  inputStyle,
  textareaStyle,
} from '../primitives/form';
import { COLOR } from '../lib/tokens';
import { humanize } from '../lib/labels';
import {
  deleteFlagRule,
  upsertFlagRule,
  useFlagsSnapshot,
} from '../data/queries';
import type {
  FlagAudience,
  FlagDef,
  FlagRule,
  FlagSurface,
  FlagValueType,
} from '../data/types';
import { DRIVER_KEYS } from '../lib/tokens';

const SURFACE_LABELS: Record<FlagSurface, string> = {
  screen: 'Screens',
  nav: 'Navigation',
  scenario: 'Scenarios',
  component: 'In-screen components',
  field: 'Text overrides',
  ai: 'AI prompts',
};

const SURFACE_ORDER: FlagSurface[] = [
  'screen',
  'nav',
  'component',
  'field',
  'scenario',
  'ai',
];

/** What kind of setting a switch holds, said without the column name. */
const VALUE_TYPE_LABELS: Record<FlagValueType, string> = {
  boolean: 'On / off',
  string: 'Text',
  number: 'Number',
  json: 'Structured settings',
};

/**
 * A switch value as a person would say it out loud.
 *
 * `JSON.stringify` was reaching the screen directly, so an admin read
 * `true` / `"Book a call"` / `{"a":1}` instead of On / the actual wording.
 */
function describeValue(value: unknown, type: FlagValueType): string {
  if (type === 'boolean') return value === true ? 'On' : 'Off';
  if (value == null) return 'Not set';
  if (typeof value === 'string') return value.trim() ? `“${value}”` : 'Empty text';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Falls back to the key when nobody wrote a description for the switch. */
function flagTitle(flag: FlagDef): string {
  return flag.description?.trim() || humanize(flag.key.replace(/\./g, ' '));
}

export function FlagsScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshot = useFlagsSnapshot(refreshKey);
  const [editing, setEditing] = useState<{
    flag: FlagDef;
    rule: FlagRule | null;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  function flashSaved() {
    setSaveStatus('saved');
    setSaveError(null);
    setTimeout(() => setSaveStatus('idle'), 3000);
  }
  function flashError(err: unknown) {
    setSaveStatus('error');
    setSaveError(err instanceof Error ? err.message : 'Save failed');
  }

  const grouped = useMemo(() => {
    const out = new Map<FlagSurface, FlagDef[]>();
    for (const f of snapshot.data.flags) {
      if (
        query &&
        !`${f.key} ${f.description ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        continue;
      const arr = out.get(f.surface) ?? [];
      arr.push(f);
      out.set(f.surface, arr);
    }
    return out;
  }, [snapshot.data.flags, query]);

  const rulesByFlag = useMemo(() => {
    const out = new Map<string, FlagRule[]>();
    for (const r of snapshot.data.rules) {
      const arr = out.get(r.flag_key) ?? [];
      arr.push(r);
      out.set(r.flag_key, arr);
    }
    return out;
  }, [snapshot.data.rules]);

  return (
    <>
      <ContextBar
        title="Feature switches"
        subtitle="A feature switch turns one part of the trainee app on or off without a new release — switch something off and it simply stops appearing for the people it targets, next time they open the app."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        {saveStatus === 'saved' && (
          <span style={{ fontSize: 13, color: COLOR.success, fontWeight: 700 }}>✓ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 13, color: COLOR.danger, fontWeight: 700 }}>
            {saveError ?? 'Save failed'}
          </span>
        )}
        <QueryBoundary query={snapshot} title="Couldn’t load the feature switches">
          {snapshot.data.flags.length === 0 ? (
            <EmptyState
              title="No feature switches yet"
              subtitle="Nothing has been set up to switch on or off. Switches are added by the development team — ask your support contact if you expected some here."
            />
          ) : (
            SURFACE_ORDER.filter((s) => grouped.has(s)).map((surface) => (
              <Glass key={surface} padding={20} radius={20}>
                <SectionTitle
                  title={SURFACE_LABELS[surface]}
                  subtitle={`${grouped.get(surface)?.length ?? 0} switches`}
                />
                <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                  {grouped.get(surface)!.map((flag) => {
                    const rules = rulesByFlag.get(flag.key) ?? [];
                    return (
                      <FlagRow
                        key={flag.key}
                        flag={flag}
                        rules={rules}
                        onEditRule={(rule) => setEditing({ flag, rule })}
                        onAddRule={() => setEditing({ flag, rule: null })}
                        onDeleteRule={async (id) => {
                          try {
                            await deleteFlagRule(id);
                            setRefreshKey((k) => k + 1);
                            flashSaved();
                          } catch (err) {
                            flashError(err);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </Glass>
            ))
          )}
        </QueryBoundary>
      </ScreenShell>
      {editing && (
        <RuleEditorModal
          flag={editing.flag}
          rule={editing.rule}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefreshKey((k) => k + 1);
            flashSaved();
          }}
        />
      )}
    </>
  );
}

function FlagRow({
  flag,
  rules,
  onEditRule,
  onAddRule,
  onDeleteRule,
}: {
  flag: FlagDef;
  rules: FlagRule[];
  onEditRule: (r: FlagRule) => void;
  onAddRule: () => void;
  onDeleteRule: (id: string) => void;
}) {
  const confirm = useConfirm();
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.55)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {/*
          What the switch does leads; the key is the identifier engineering
          quotes in a bug report, so it stays available but small. The other
          way round, the row read as a config file to everyone else.
        */}
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: COLOR.ink,
            lineHeight: 1.35,
          }}
        >
          {flagTitle(flag)}
        </div>
        <div
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            color: COLOR.inkMute,
            marginTop: 3,
            wordBreak: 'break-word',
          }}
        >
          {flag.key}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          <Eyebrow style={{ marginRight: 4 }}>Everyone gets</Eyebrow>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(60,20,15,0.05)',
              color: COLOR.ink,
            }}
          >
            {describeValue(flag.default_value, flag.value_type)}
          </span>
          <span
            style={{ fontSize: 11, color: COLOR.inkMute, fontWeight: 700 }}
          >
            · {VALUE_TYPE_LABELS[flag.value_type]}
          </span>
        </div>
        {rules.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            {rules.map((r) => (
              <div
                key={r.id}
                onClick={() => onEditRule(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'rgba(60,20,15,0.04)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <StatusPill tone={r.enabled ? 'success' : 'neutral'}>
                  {r.enabled ? `Priority ${r.priority}` : 'Paused'}
                </StatusPill>
                <span style={{ color: COLOR.inkMute }}>
                  {summarizeAudience(r.audience)}
                </span>
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                  gets {describeValue(r.value, flag.value_type)}
                </span>
                {/*
                  Reference usage of the confirmation ladder: rung 2 — the
                  delete is destructive but scoped, so it gets a danger dialog
                  that names what changes, and no type-to-confirm.
                  `window.confirm` used to ask "Delete this rule?" without ever
                  saying which audience stops being targeted.
                */}
                <button
                  type="button"
                  className="pbt-btn"
                  aria-label={`Delete rule targeting ${summarizeAudience(r.audience)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void confirm({
                      title: 'Delete this targeting rule?',
                      body: (
                        <>
                          Rule on “{flagTitle(flag)}” at priority {r.priority}.
                        </>
                      ),
                      consequences: [
                        `${summarizeAudience(r.audience)} stops getting ${describeValue(r.value, flag.value_type)}.`,
                        `They go back to what everyone gets (${describeValue(flag.default_value, flag.value_type)}), or to a lower-priority rule.`,
                        'Takes effect the next time they open the app — no release needed.',
                      ],
                      confirmLabel: 'Delete rule',
                      tone: 'danger',
                    }).then((ok) => {
                      if (ok) onDeleteRule(r.id);
                    });
                  }}
                  style={{
                    padding: '2px 6px',
                    border: 'none',
                    background: 'transparent',
                    color: COLOR.danger,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onAddRule}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 12px',
          borderRadius: 10,
          border: '1px solid rgba(60,20,15,0.12)',
          background: 'rgba(255,255,255,0.6)',
          color: COLOR.ink,
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + Target a group
      </button>
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function summarizeAudience(a: FlagAudience): string {
  const parts: string[] = [];
  if (a.drivers?.length) parts.push(`${a.drivers.join(', ')} styles`);
  if (a.user_ids?.length) parts.push(plural(a.user_ids.length, 'named person', 'named people'));
  if (a.anon_session_ids?.length)
    parts.push(plural(a.anon_session_ids.length, 'device', 'devices'));
  if (a.clinic_ids?.length) parts.push(plural(a.clinic_ids.length, 'clinic', 'clinics'));
  if (typeof a.percentage === 'number')
    parts.push(`a random ${a.percentage}% of them`);
  return parts.length ? parts.join(' · ') : 'Everyone';
}

/** On/off switches get a two-state choice, not a box to type `true` into. */
function OnOffChoice({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div role="radiogroup" style={{ display: 'flex', gap: 6 }}>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          style={{
            padding: '8px 18px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: value === v ? COLOR.brand : 'rgba(60,20,15,0.06)',
            color: value === v ? '#fff' : COLOR.ink,
            fontFamily: 'var(--pbt-font)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {v ? 'On' : 'Off'}
        </button>
      ))}
    </div>
  );
}

function RuleEditorModal({
  flag,
  rule,
  onClose,
  onSaved,
}: {
  flag: FlagDef;
  rule: FlagRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A new rule starts at the opposite of the default for an on/off switch —
  // a rule that hands the same value back to a group does nothing.
  const initialValue =
    rule?.value ??
    (flag.value_type === 'boolean' ? !flag.default_value : flag.default_value);
  const [boolValue, setBoolValue] = useState(initialValue === true);
  const [textValue, setTextValue] = useState(
    typeof initialValue === 'string' || typeof initialValue === 'number'
      ? String(initialValue)
      : '',
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(initialValue ?? null, null, 2),
  );
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [percentage, setPercentage] = useState<number | ''>(
    typeof rule?.audience?.percentage === 'number'
      ? rule.audience.percentage
      : '',
  );
  const [drivers, setDrivers] = useState<string[]>(rule?.audience?.drivers ?? []);
  const [userIds, setUserIds] = useState(
    (rule?.audience?.user_ids ?? []).join(', '),
  );
  const [anonIds, setAnonIds] = useState(
    (rule?.audience?.anon_session_ids ?? []).join(', '),
  );
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [note, setNote] = useState(rule?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let value: unknown;
      if (flag.value_type === 'boolean') {
        value = boolValue;
      } else if (flag.value_type === 'number') {
        const n = Number(textValue);
        if (!textValue.trim() || Number.isNaN(n))
          throw new Error('Enter a number for this setting.');
        value = n;
      } else if (flag.value_type === 'string') {
        value = textValue;
      } else {
        try {
          value = JSON.parse(jsonText);
        } catch {
          throw new Error(
            'The structured settings aren’t valid JSON — check the brackets, commas and quotes.',
          );
        }
      }
      const audience: FlagAudience = {};
      if (drivers.length) audience.drivers = drivers as FlagAudience['drivers'];
      const us = userIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (us.length) audience.user_ids = us;
      const as = anonIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (as.length) audience.anon_session_ids = as;
      if (typeof percentage === 'number')
        audience.percentage = Math.max(0, Math.min(100, percentage));

      await upsertFlagRule({
        ...(rule?.id ? { id: rule.id } : {}),
        flag_key: flag.key,
        priority,
        audience,
        value,
        enabled,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={rule ? 'Edit targeting rule' : 'New targeting rule'}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Feature switch">
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
            {flagTitle(flag)}
          </div>
          <div
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              color: COLOR.inkMute,
              marginTop: 2,
            }}
          >
            {flag.key}
          </div>
        </Field>
        <Field
          label="What this group gets"
          help={`Everyone else keeps the current setting: ${describeValue(
            flag.default_value,
            flag.value_type,
          )}.`}
        >
          {flag.value_type === 'boolean' ? (
            <OnOffChoice value={boolValue} onChange={setBoolValue} />
          ) : flag.value_type === 'json' ? (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={4}
              aria-label="Structured settings, written as JSON"
              style={textareaStyle}
            />
          ) : (
            <input
              type={flag.value_type === 'number' ? 'number' : 'text'}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder={flag.value_type === 'number' ? '0' : 'Type the wording…'}
              style={inputStyle}
            />
          )}
        </Field>
        {flag.value_type === 'json' && (
          <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: -8 }}>
            This switch holds structured settings, so it is edited as JSON. If
            you aren’t sure of the shape, ask your support contact rather than
            guessing — a malformed value is refused, not applied.
          </div>
        )}
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <Field
            label="Priority"
            help="When two rules match the same person, the higher number wins. Leave at 100 unless one rule needs to beat another."
          >
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Rule is active" help="Pause a rule to keep it without applying it.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {enabled ? 'Active' : 'Paused'}
            </label>
          </Field>
        </div>
        <Field label="Communication styles (any of)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DRIVER_KEYS.map((d) => {
              const on = drivers.includes(d);
              return (
                <button
                  key={d}
                  onClick={() =>
                    setDrivers((prev) =>
                      on ? prev.filter((x) => x !== d) : [...prev, d],
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: 'pointer',
                    background: on ? COLOR.brand : 'rgba(60,20,15,0.06)',
                    color: on ? '#fff' : COLOR.ink,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </Field>
        <Field
          label="Named people"
          help="Account IDs, separated by commas — copy them from a person’s row on the People screen. Only matches people who are signed in."
        >
          <input
            value={userIds}
            onChange={(e) => setUserIds(e.target.value)}
            placeholder="account id, account id, …"
            style={inputStyle}
          />
        </Field>
        <Field
          label="Devices without an account"
          help="Device IDs for people training anonymously, separated by commas."
        >
          <input
            value={anonIds}
            onChange={(e) => setAnonIds(e.target.value)}
            placeholder="device id, device id, …"
            style={inputStyle}
          />
        </Field>
        <Field
          label="Share of people"
          help="Give this to a random share of the people above — and to the same ones each time. Leave empty to include all of them."
        >
          <input
            type="number"
            min={0}
            max={100}
            value={percentage}
            onChange={(e) =>
              setPercentage(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder="(all of them)"
            style={inputStyle}
          />
        </Field>
        <Field label="Why (optional)" help="A note for whoever reads this rule next.">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
        </Field>
        {error && (
          <div style={{ color: COLOR.danger, fontSize: 12 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── shared modal primitives ──────────────────────────────────

export function ModalShell({
  title,
  onClose,
  children,
  width = 560,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  // Esc-to-close + body scroll lock, matching the shared Modal primitive.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(20,12,14,0.32)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: width }}>
        <Glass padding={24} radius={20}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: COLOR.ink,
                letterSpacing: '-0.02em',
              }}
            >
              {title}
            </div>
            <button onClick={onClose} style={{ ...btnSecondary, padding: '4px 10px' }}>
              ×
            </button>
          </div>
          {children}
        </Glass>
      </div>
    </div>
  );
}

/*
 * `Field` and the four style objects now live in `primitives/form.tsx` — they
 * are the portal's form vocabulary, and half the admin screens were importing
 * them from this file, which made a screen the design system.
 *
 * They stay re-exported here so those imports keep resolving. New code should
 * import from `primitives/form` (and prefer `<Button>` over the style objects,
 * since it carries hover / focus-visible / disabled states these cannot).
 */
export { Field, inputStyle, textareaStyle, btnPrimary, btnSecondary };
