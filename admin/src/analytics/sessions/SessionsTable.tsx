/**
 * The session explorer's table: one row per conversation, sortable by when,
 * score and length. The whole row opens the session (mouse); the scenario
 * title is the row's real button (keyboard), and the trainee's name is its
 * own link to their profile — no interactive control nests inside another.
 *
 * The table keeps a minimum width and scrolls inside its own container on
 * narrow screens; nothing else on the page moves sideways.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { Avatar, ScoreBadge, StatusPill } from '../../primitives';
import { AdminDifficultyMeter } from '../../primitives/DifficultyMeter';
import { COLOR, DRIVER_KEYS, type DriverKey } from '../../lib/tokens';
import { fmtAgo } from '../../lib/format';
import { MODE_LABELS, labelOf } from '../../lib/labels';
import { isScored } from '../lib/metrics';
import {
  OWNER_ENDING_LABELS,
  fmtLength,
  objectionIfDifferent,
  outcomeWords,
  scenarioContext,
  sessionTitle,
  type SortDir,
  type SortKey,
} from '../lib/sessionsExplorer';

export interface TableRowPerson {
  name: string;
  driver: string | null;
  /** False when the trainee isn't in the directory (deleted account) — no profile to open. */
  known: boolean;
}

const MOOD_COLOR = { green: COLOR.success, yellow: COLOR.warn, red: COLOR.danger } as const;

function asDriver(v: string | null): DriverKey | null {
  return v && (DRIVER_KEYS as string[]).includes(v) ? (v as DriverKey) : null;
}

const th: CSSProperties = {
  padding: '11px 12px',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
  color: COLOR.inkMute,
  textAlign: 'left',
  whiteSpace: 'nowrap',
  background: 'rgba(255,255,255,0.55)',
  borderBottom: '0.5px solid rgba(60,20,15,0.08)',
};

const td: CSSProperties = {
  padding: '11px 12px',
  borderBottom: '0.5px solid rgba(60,20,15,0.05)',
  verticalAlign: 'middle',
  fontSize: 12.5,
  color: COLOR.inkSoft,
};

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = 'left',
  width,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  width?: number;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ ...th, textAlign: align, width }}
    >
      <button
        type="button"
        className="pbt-sortable pbt-focusable"
        onClick={() => onSort(k)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: active ? COLOR.ink : COLOR.inkMute,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        {label}
        <span aria-hidden="true" style={{ fontSize: 8, opacity: active ? 1 : 0.35 }}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </button>
    </th>
  );
}

function Plain({ children, width, align = 'left' }: { children: ReactNode; width?: number; align?: 'left' | 'right' }) {
  return (
    <th scope="col" style={{ ...th, width, textAlign: align }}>
      {children}
    </th>
  );
}

export function SessionsTable({
  rows,
  personOf,
  sort,
  onSort,
  onOpenSession,
  onOpenTrainee,
}: {
  rows: readonly SessionSummary[];
  personOf: (userId: string) => TableRowPerson;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  onOpenSession: (id: string) => void;
  onOpenTrainee: (userId: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
          Practice sessions. Select a scenario to open the session.
        </caption>
        <colgroup>
          <col style={{ width: 168 }} />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 66 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 54 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr>
            <Plain>Trainee</Plain>
            <Plain>Scenario</Plain>
            <Plain>Outcome</Plain>
            <Plain>Difficulty</Plain>
            <Plain>Mode</Plain>
            <SortHeader label="Length" k="length" sort={sort} onSort={onSort} />
            <Plain>Hints</Plain>
            <Plain>Owner ending</Plain>
            <SortHeader label="Score" k="score" sort={sort} onSort={onSort} />
            <SortHeader label="When" k="when" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const p = personOf(s.user_id);
            const title = sessionTitle(s);
            const objection = objectionIfDifferent(s);
            const at = new Date(s.created_at);
            const scored = isScored(s);
            return (
              <tr
                key={s.id}
                className="pbt-row-hover"
                onClick={() => onOpenSession(s.id)}
                style={{ cursor: 'pointer' }}
              >
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <Avatar name={p.name} driver={asDriver(p.driver)} size={26} />
                    {p.known ? (
                      <button
                        type="button"
                        className="pbt-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTrainee(s.user_id);
                        }}
                        title={`Open ${p.name}’s profile`}
                        style={{
                          fontSize: 12.5,
                          color: COLOR.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          textAlign: 'left',
                        }}
                      >
                        {p.name}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 650, color: COLOR.inkMute, fontSize: 12.5 }}>{p.name}</span>
                    )}
                  </div>
                </td>
                <td style={td}>
                  <button
                    type="button"
                    className="pbt-focusable"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSession(s.id);
                    }}
                    title={title}
                    style={{
                      all: 'unset',
                      display: 'block',
                      maxWidth: '100%',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      color: COLOR.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </button>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: COLOR.inkMute,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {objection && <span style={{ color: COLOR.inkSoft, fontWeight: 650 }}>{objection} · </span>}
                    {scenarioContext(s)}
                  </div>
                </td>
                <td style={td}>
                  {s.completed ? (
                    <StatusPill tone="success">Finished</StatusPill>
                  ) : (
                    <StatusPill tone={s.ended_reason === 'error' ? 'danger' : 'neutral'}>{outcomeWords(s)}</StatusPill>
                  )}
                </td>
                <td style={td}>
                  {s.difficulty != null ? <AdminDifficultyMeter level={s.difficulty} /> : <Muted>—</Muted>}
                </td>
                <td style={td}>{s.mode ? labelOf(MODE_LABELS, s.mode) : <Muted>—</Muted>}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{fmtLength(s.duration_seconds)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                  {s.hints_used == null ? (
                    <Muted>—</Muted>
                  ) : s.hints_used === 0 ? (
                    <Muted>0</Muted>
                  ) : (
                    <strong style={{ color: COLOR.ink }}>{s.hints_used}</strong>
                  )}
                </td>
                <td style={td}>
                  {s.owner_mood_end ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 7, height: 7, borderRadius: '50%', background: MOOD_COLOR[s.owner_mood_end] }}
                      />
                      {OWNER_ENDING_LABELS[s.owner_mood_end]}
                    </span>
                  ) : (
                    <Muted>—</Muted>
                  )}
                </td>
                <td style={td}>
                  {scored ? (
                    <ScoreBadge score={s.score_overall} />
                  ) : s.completed && s.score_unavailable ? (
                    <span title="The scorer failed — this session is left out of every average">
                      <Muted>—</Muted>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 750, color: 'oklch(0.50 0.14 70)' }}>
                        Scoring failed
                      </span>
                    </span>
                  ) : (
                    <span title="Only finished sessions are scored">
                      <Muted>—</Muted>
                    </span>
                  )}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }} title={at.toLocaleString()}>
                  {Number.isNaN(at.getTime()) ? '—' : fmtAgo(at.getTime())}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span style={{ color: COLOR.inkMute, fontWeight: 600 }}>{children}</span>;
}
