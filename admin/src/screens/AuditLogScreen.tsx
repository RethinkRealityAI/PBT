import { useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { EmptyState, LoadingShimmer, SectionTitle, StatusPill } from '../primitives';
import { useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { COLOR } from '../lib/tokens';
import { revertAuditEntry, useAuditLog } from '../data/queries';
import { fmtAgo } from '../lib/format';
import { REVERTABLE_ENTITY_TYPES, type AuditLogRow } from '../data/types';

const ACTION_TONE: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'neutral'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  revert: 'warn',
};

export function AuditLogScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [reverting, setReverting] = useState<string | null>(null);
  const log = useAuditLog(200, refreshKey);
  const confirm = useConfirm();
  const toast = useToast();

  async function revert(row: AuditLogRow) {
    const ok = await confirm({
      title: 'Roll back this change?',
      body: (
        <>
          Restores <code>{row.entity_type}</code>{' '}
          <code>{row.entity_id}</code> to the “before” state recorded in this
          entry.
        </>
      ),
      consequences: [
        'Any edits made to this entity since then are overwritten.',
        'The rollback is itself audited, so it can be inspected — but not undone with one click.',
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
      toast({ message: `Reverted ${row.entity_type} ${row.entity_id}.`, tone: 'success' });
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
        subtitle="Every admin change — flags, rules, scenario overrides, simulation config, people, and email. Revert rolls back the ones that can be rolled back."
      />
      <ScreenShell>
        <Glass padding={20} radius={20}>
          <SectionTitle title="Recent changes" subtitle={`Last ${log.data.length}`} />
          {log.loading ? (
            <LoadingShimmer height={200} />
          ) : log.data.length === 0 ? (
            <EmptyState title="No changes yet" />
          ) : (
            <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
              {log.data.map((row) => (
                <AuditRow
                  key={row.id}
                  row={row}
                  onRevert={() => void revert(row)}
                  reverting={reverting === row.id}
                />
              ))}
            </div>
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}

function AuditRow({
  row,
  onRevert,
  reverting,
}: {
  row: AuditLogRow;
  onRevert: () => void;
  reverting: boolean;
}) {
  const [open, setOpen] = useState(false);
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
          {row.action}
        </StatusPill>
        <code style={{ fontSize: 11, color: COLOR.inkMute }}>
          {row.entity_type}
        </code>
        <code style={{ fontSize: 11, color: COLOR.ink, fontWeight: 700 }}>
          {row.entity_id}
        </code>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: COLOR.inkMute }}>
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
          {open ? 'Hide' : 'Diff'}
        </button>
        <button
          type="button"
          className="pbt-btn"
          onClick={onRevert}
          disabled={reverting || !revertable}
          title={
            revertable
              ? `Restore ${row.entity_type} ${row.entity_id} to its “before” state`
              : row.action === 'revert'
                ? 'This entry is itself a revert — roll back the original change instead.'
                : `Revert isn’t supported for ${row.entity_type}. Only flags, flag rules, scenario overrides, simulation config, and knowledge documents can be rolled back.`
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 10,
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
          }}
        >
          <DiffPane label="Before" value={row.before} />
          <DiffPane label="After" value={row.after} />
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
