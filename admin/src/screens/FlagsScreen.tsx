import { useMemo, useState } from 'react';
import {
  EmptyState,
  Eyebrow,
  LoadingShimmer,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { Glass } from '../primitives/Glass';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
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
        title="Feature flags"
        subtitle="Toggle screens, navigation, components, scenarios, and field text — globally or for a targeted audience."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        {snapshot.loading ? (
          <LoadingShimmer height={280} />
        ) : snapshot.data.flags.length === 0 ? (
          <EmptyState title="No flags registered" subtitle="Run the latest migration to seed the flag registry." />
        ) : (
          SURFACE_ORDER.filter((s) => grouped.has(s)).map((surface) => (
            <Glass key={surface} padding={20} radius={20}>
              <SectionTitle
                title={SURFACE_LABELS[surface]}
                subtitle={`${grouped.get(surface)?.length ?? 0} flags`}
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
                        await deleteFlagRule(id);
                        setRefreshKey((k) => k + 1);
                      }}
                    />
                  );
                })}
              </div>
            </Glass>
          ))
        )}
      </ScreenShell>
      {editing && (
        <RuleEditorModal
          flag={editing.flag}
          rule={editing.rule}
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
        <div
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 12,
            fontWeight: 700,
            color: COLOR.ink,
            wordBreak: 'break-word',
          }}
        >
          {flag.key}
        </div>
        {flag.description && (
          <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 2 }}>
            {flag.description}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          <Eyebrow style={{ marginRight: 4 }}>Default</Eyebrow>
          <code
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(60,20,15,0.05)',
              color: COLOR.ink,
            }}
          >
            {JSON.stringify(flag.default_value)}
          </code>
          <span
            style={{ fontSize: 11, color: COLOR.inkMute, fontWeight: 700 }}
          >
            · {flag.value_type}
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
                  {r.enabled ? `priority ${r.priority}` : 'off'}
                </StatusPill>
                <span style={{ color: COLOR.inkMute }}>
                  {summarizeAudience(r.audience)}
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--pbt-mono)' }}>
                  → {JSON.stringify(r.value)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this rule?')) onDeleteRule(r.id);
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
        + Add rule
      </button>
    </div>
  );
}

function summarizeAudience(a: FlagAudience): string {
  const parts: string[] = [];
  if (a.drivers?.length) parts.push(`drivers: ${a.drivers.join(', ')}`);
  if (a.user_ids?.length) parts.push(`${a.user_ids.length} user(s)`);
  if (a.anon_session_ids?.length)
    parts.push(`${a.anon_session_ids.length} session(s)`);
  if (a.clinic_ids?.length) parts.push(`${a.clinic_ids.length} clinic(s)`);
  if (typeof a.percentage === 'number') parts.push(`${a.percentage}% rollout`);
  return parts.length ? parts.join(' · ') : 'everyone';
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
  const [valueText, setValueText] = useState(() =>
    JSON.stringify(
      rule?.value ??
        (flag.value_type === 'boolean'
          ? !flag.default_value
          : flag.default_value),
    ),
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
      try {
        value = JSON.parse(valueText);
      } catch {
        throw new Error('Value must be valid JSON.');
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
    <ModalShell title={rule ? 'Edit rule' : 'New rule'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Flag">
          <code style={{ fontSize: 12 }}>{flag.key}</code>
        </Field>
        <Field
          label="Value"
          help={`JSON literal — must match value_type: ${flag.value_type}`}
        >
          <textarea
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </Field>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Priority" help="Higher wins. Default 100; user-list rules typically 200+.">
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Enabled">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {enabled ? 'On' : 'Off'}
            </label>
          </Field>
        </div>
        <Field label="Drivers (any of)">
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
          label="User IDs"
          help="Comma-separated auth user UUIDs. Matches signed-in users."
        >
          <input
            value={userIds}
            onChange={(e) => setUserIds(e.target.value)}
            placeholder="uuid, uuid, ..."
            style={inputStyle}
          />
        </Field>
        <Field
          label="Anonymous session IDs"
          help="Comma-separated pbt:session_id values. For pre-auth targeting."
        >
          <input
            value={anonIds}
            onChange={(e) => setAnonIds(e.target.value)}
            placeholder="id, id, ..."
            style={inputStyle}
          />
        </Field>
        <Field
          label="Rollout percentage"
          help="Sticky bucket 0–99 by user/session id. Empty = no percentage gate."
        >
          <input
            type="number"
            min={0}
            max={100}
            value={percentage}
            onChange={(e) =>
              setPercentage(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder="(none)"
            style={inputStyle}
          />
        </Field>
        <Field label="Note (optional)">
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

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
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
        {label}
      </div>
      {children}
      {help && (
        <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>
          {help}
        </div>
      )}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(60,20,15,0.12)',
  background: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--pbt-mono)',
  resize: 'vertical',
};

export const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: COLOR.brand,
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
};

export const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(60,20,15,0.12)',
  background: 'rgba(255,255,255,0.6)',
  color: COLOR.ink,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
};
