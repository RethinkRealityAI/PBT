import { useMemo, useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { EmptyState, SectionTitle, StatusPill } from '../primitives';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { COLOR } from '../lib/tokens';
import {
  AUDIT_ACTION_LABELS,
  ENTITY_LABELS,
  humanize,
  labelOf,
} from '../lib/labels';
import { revertAuditEntry, useAdminUsers, useAuditLog } from '../data/queries';
import { fmtAgo } from '../lib/format';
import {
  REVERTABLE_ENTITY_TYPES,
  type AdminUser,
  type AuditLogRow,
} from '../data/types';

const ACTION_TONE: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'neutral'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  revert: 'warn',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Row bookkeeping — present in every payload, changed by nobody on purpose. */
const NOISE_FIELDS = new Set(['id', 'created_at', 'updated_at']);

/** Beyond this the list stops being a summary; the full record is a click away. */
const MAX_SUMMARY_FIELDS = 8;

function actorName(row: AuditLogRow, byId: Map<string, AdminUser>): string {
  if (!row.actor_id) return 'the system';
  const u = byId.get(row.actor_id);
  return u?.display_name?.trim() || u?.email || 'an administrator';
}

/**
 * A name for the thing that changed.
 *
 * `entity_id` is a UUID for most tables, which tells the reader nothing — but
 * the recorded payload almost always carries the human handle (the switch key,
 * the scenario, the template name). Fall back to the id only when it is itself
 * readable (flag keys, `global`), and to nothing at all when it is a UUID.
 */
function targetName(
  row: AuditLogRow,
  byId: Map<string, AdminUser>,
): string | null {
  if (row.entity_type === 'user') {
    const u = byId.get(row.entity_id);
    const name = u?.display_name?.trim() || u?.email;
    if (name) return name;
  }
  const payload = row.after ?? row.before;
  for (const field of [
    'key',
    'flag_key',
    'title',
    'name',
    'label',
    'scenario_id',
    'email',
    'display_name',
  ]) {
    const v = payload?.[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return UUID_RE.test(row.entity_id) ? null : row.entity_id;
}

function fieldValue(v: unknown): string {
  if (v == null) return 'nothing';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return 'empty';
    return t.length > 70 ? `“${t.slice(0, 70)}…”` : `“${t}”`;
  }
  if (Array.isArray(v)) return v.length === 1 ? '1 item' : `${v.length} items`;
  return 'a group of settings';
}

interface FieldChange {
  label: string;
  /** null when there was no "before" — i.e. the entry created the record. */
  from: string | null;
  /** null when there is no "after" — i.e. the entry deleted the record. */
  to: string | null;
}

function summarizeChange(row: AuditLogRow): FieldChange[] {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const out: FieldChange[] = [];
  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({
      label: humanize(key),
      from: row.before ? fieldValue(b) : null,
      to: row.after ? fieldValue(a) : null,
    });
  }
  return out;
}

export function AuditLogScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [reverting, setReverting] = useState<string | null>(null);
  const log = useAuditLog(200, refreshKey);
  // Names only — a failure here costs the "by whom" column, not the log, so
  // this query stays out of the boundary below.
  const users = useAdminUsers();
  const confirm = useConfirm();
  const toast = useToast();

  const usersById = useMemo(
    () => new Map(users.data.map((u) => [u.user_id, u])),
    [users.data],
  );

  async function revert(row: AuditLogRow) {
    const entity = labelOf(ENTITY_LABELS, row.entity_type).toLowerCase();
    const name = targetName(row, usersById);
    const ok = await confirm({
      title: 'Roll back this change?',
      body: (
        <>
          Puts the {entity}
          {name ? <> “{name}”</> : null} back to how it was before this change.
        </>
      ),
      consequences: [
        'Anything edited since then is overwritten.',
        'The rollback is recorded here too, so it can be inspected — but not undone with one click.',
        'It takes effect immediately for everyone.',
      ],
      confirmLabel: 'Revert',
      tone: 'danger',
    });
    if (!ok) return;
    setReverting(row.id);
    try {
      await revertAuditEntry(row.id);
      setRefreshKey((k) => k + 1);
      toast({
        message: `Rolled back the ${entity}${name ? ` “${name}”` : ''}.`,
        tone: 'success',
      });
    } catch (err) {
      // Revert 400s on unsupported entity types and 409s when the entity has
      // since been deleted. Swallowing that left the row looking unchanged and
      // the reader believing the rollback landed.
      toast({
        message:
          err instanceof Error
            ? `Revert failed — ${err.message}`
            : 'Revert failed. The change was not rolled back.',
        tone: 'error',
      });
    } finally {
      setReverting(null);
    }
  }

  return (
    <>
      <ContextBar
        title="Audit log"
        subtitle="Every change made in this portal — who made it, what it was, and when. Revert puts a change back the way it was, where that is possible."
      />
      <ScreenShell>
        <Glass padding={20} radius={20}>
          <SectionTitle
            title="Recent changes"
            subtitle={
              log.loading || log.error
                ? undefined
                : `Newest first · ${log.data.length} entries`
            }
          />
          <QueryBoundary query={log} title="Couldn’t load the audit log">
            {log.data.length === 0 ? (
              <EmptyState
                title="No changes yet"
                subtitle="Nothing has been changed in this portal. Every edit will appear here with the person who made it."
              />
            ) : (
              <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
                {log.data.map((row) => (
                  <AuditRow
                    key={row.id}
                    row={row}
                    actor={actorName(row, usersById)}
                    target={targetName(row, usersById)}
                    onRevert={() => void revert(row)}
                    reverting={reverting === row.id}
                  />
                ))}
              </div>
            )}
          </QueryBoundary>
        </Glass>
      </ScreenShell>
    </>
  );
}

function AuditRow({
  row,
  actor,
  target,
  onRevert,
  reverting,
}: {
  row: AuditLogRow;
  actor: string;
  target: string | null;
  onRevert: () => void;
  reverting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const entity = labelOf(ENTITY_LABELS, row.entity_type);
  const changes = useMemo(() => summarizeChange(row), [row]);
  // The server can only roll back entity types it has a restore branch for;
  // anything else 400s. Don't offer an action that cannot succeed.
  const revertable = REVERTABLE_ENTITY_TYPES.has(row.entity_type) && row.action !== 'revert';
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.55)',
        border: '0.5px solid rgba(255,255,255,0.9)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusPill tone={ACTION_TONE[row.action] ?? 'neutral'}>
          {labelOf(AUDIT_ACTION_LABELS, row.action)}
        </StatusPill>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
            {entity}
            {target && (
              <span style={{ fontWeight: 400, color: COLOR.inkSoft }}> — {target}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 2 }}>
            by {actor}
          </div>
        </div>
        <span style={{ fontSize: 11, color: COLOR.inkMute }}>
          {fmtAgo(new Date(row.created_at).getTime())}
        </span>
        <button
          type="button"
          className="pbt-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid rgba(60,20,15,0.12)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--pbt-font)',
          }}
        >
          {open ? 'Hide' : 'What changed'}
        </button>
        <button
          type="button"
          className="pbt-btn"
          onClick={onRevert}
          disabled={reverting || !revertable}
          title={
            revertable
              ? `Put this ${entity.toLowerCase()} back to how it was before this change`
              : row.action === 'revert'
                ? 'This entry is itself a rollback — roll back the original change instead.'
                : `Rollback isn’t available for a ${entity.toLowerCase()}. Only feature switches, their targeting rules, scenario edits, simulation settings, and knowledge documents can be rolled back.`
          }
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: 'none',
            cursor: revertable && !reverting ? 'pointer' : 'not-allowed',
            background: reverting ? 'rgba(60,20,15,0.06)' : COLOR.brandSoft,
            color: COLOR.brand,
            fontWeight: 700,
            fontSize: 11,
            fontFamily: 'var(--pbt-font)',
            opacity: revertable ? 1 : 0.45,
          }}
        >
          {reverting ? '…' : 'Revert'}
        </button>
      </div>
      {row.note && (
        <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 6 }}>
          {row.note}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          <ChangeSummary changes={changes} />
          <button
            type="button"
            className="pbt-btn"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            style={{
              marginTop: 10,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: COLOR.inkMute,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--pbt-font)',
              textDecoration: 'underline',
            }}
          >
            {showRaw ? 'Hide the full record' : 'Show the full record'}
          </button>
          {showRaw && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginTop: 8,
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11,
              }}
            >
              <DiffPane label="Before" value={row.before} />
              <DiffPane label="After" value={row.after} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeSummary({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>
        No settings differed between before and after — the record was re-saved
        unchanged.
      </div>
    );
  }
  const shown = changes.slice(0, MAX_SUMMARY_FIELDS);
  const hidden = changes.length - shown.length;
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {shown.map((c) => (
        <div key={c.label} style={{ fontSize: 12.5, color: COLOR.inkSoft }}>
          <span style={{ fontWeight: 700, color: COLOR.ink }}>{c.label}</span>{' '}
          {c.from != null && c.to != null ? (
            <>
              {c.from} <span aria-hidden>→</span>{' '}
              <span style={{ fontWeight: 700, color: COLOR.ink }}>{c.to}</span>
            </>
          ) : c.to != null ? (
            <>
              set to{' '}
              <span style={{ fontWeight: 700, color: COLOR.ink }}>{c.to}</span>
            </>
          ) : (
            <>was {c.from}</>
          )}
        </div>
      ))}
      {hidden > 0 && (
        <div style={{ fontSize: 12, color: COLOR.inkMute }}>
          and {hidden} more {hidden === 1 ? 'setting' : 'settings'} — see the
          full record below.
        </div>
      )}
    </div>
  );
}

function DiffPane({ label, value }: { label: string; value: unknown }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        background: 'rgba(60,20,15,0.04)',
        maxHeight: 240,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  );
}
