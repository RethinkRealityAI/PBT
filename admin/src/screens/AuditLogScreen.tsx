import { useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { EmptyState, LoadingShimmer, SectionTitle, StatusPill } from '../primitives';
import { COLOR } from '../lib/tokens';
import { revertAuditEntry, useAuditLog } from '../data/queries';
import { fmtAgo } from '../lib/format';
import type { AuditLogRow } from '../data/types';

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

  async function revert(id: string) {
    if (!confirm('Revert to the state recorded in this entry?')) return;
    setReverting(id);
    try {
      await revertAuditEntry(id);
      setRefreshKey((k) => k + 1);
    } finally {
      setReverting(null);
    }
  }

  return (
    <>
      <ContextBar
        title="Audit log"
        subtitle="Every flag, rule, and scenario-override change. Click revert to roll back."
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
                  onRevert={() => void revert(row.id)}
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
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid rgba(60,20,15,0.12)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {open ? 'Hide' : 'Diff'}
        </button>
        <button
          onClick={onRevert}
          disabled={reverting || row.action === 'revert'}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: reverting ? 'rgba(60,20,15,0.06)' : COLOR.brandSoft,
            color: COLOR.brand,
            fontWeight: 700,
            fontSize: 11,
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
