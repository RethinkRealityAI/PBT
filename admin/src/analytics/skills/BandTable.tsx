/**
 * Band-tinted score tables for the Skills tab: objection × skill, and the
 * trainee-style × owner-style matchups.
 *
 * Cells are tinted with LIGHT versions of the score-band colours so dark
 * text stays readable, every value is printed in its cell, and a legend
 * names each band in words — the tint is never the only signal.
 */
import type { CSSProperties, ReactNode } from 'react';
import { COLOR, DRIVERS, type DriverKey } from '../../lib/tokens';
import { CHART, bandWord } from '../ui';
import { SKILL_KEYS, SKILL_LABELS, type SkillKey } from '../lib/metrics';
import type { ObjectionSkillRow } from '../lib/skills';
import '../overview/styles';

/** Light band tints (≈ L 0.93) — dark ink stays at AA contrast on every one. */
export const BAND_TINT = {
  strong: 'oklch(0.925 0.065 150)',
  solid: 'oklch(0.925 0.045 250)',
  developing: 'oklch(0.94 0.075 80)',
  needsWork: 'oklch(0.925 0.06 25)',
} as const;

export function bandTint(score: number | null): string {
  if (score == null) return CHART.track;
  return score >= 85 ? BAND_TINT.strong : score >= 70 ? BAND_TINT.solid : score >= 55 ? BAND_TINT.developing : BAND_TINT.needsWork;
}

export function BandLegend() {
  const items: Array<[string, string]> = [
    ['Strong 85+', BAND_TINT.strong],
    ['Solid 70–84', BAND_TINT.solid],
    ['Developing 55–69', BAND_TINT.developing],
    ['Needs work <55', BAND_TINT.needsWork],
  ];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} aria-label="Score bands">
      {items.map(([label, color]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLOR.inkSoft }}>
          <span aria-hidden="true" style={{ width: 14, height: 10, borderRadius: 3, background: color, border: '0.5px solid rgba(60,20,15,0.08)' }} />
          {label}
        </span>
      ))}
    </div>
  );
}

const TH: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: COLOR.inkMute,
  padding: '0 4px 8px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

function Cell({
  value,
  title,
  strong,
  outlined,
}: {
  value: number | null;
  title: string;
  strong?: boolean;
  outlined?: boolean;
}) {
  return (
    <td
      title={title}
      style={{
        background: bandTint(value),
        borderRadius: 7,
        height: 34,
        minWidth: 58,
        textAlign: 'center',
        fontSize: strong ? 13.5 : 12.5,
        fontWeight: strong ? 850 : 700,
        color: value == null ? COLOR.inkMute : COLOR.ink,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: outlined ? `inset 0 0 0 1.5px ${COLOR.ink}` : undefined,
      }}
    >
      {value == null ? '—' : Math.round(value)}
    </td>
  );
}

/**
 * Objections down the side, the five skills + overall across. The single
 * weakest cell (`hardest`) is outlined — it is what the sentence above the
 * table names.
 */
export function ObjectionSkillTable({
  rows,
  hardest,
}: {
  rows: ObjectionSkillRow[];
  hardest?: { key: string; skill: SkillKey } | null;
}) {
  return (
    <div style={{ overflowX: 'auto', margin: '0 -4px', padding: '0 4px' }}>
      <table className="pbt-sk-table" style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', minWidth: 640 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Average skill scores per objection
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...TH, textAlign: 'left', paddingLeft: 0 }}>
              Objection
            </th>
            {SKILL_KEYS.map((k) => (
              <th key={k} scope="col" style={TH}>
                {SKILL_LABELS[k]}
              </th>
            ))}
            <th scope="col" style={{ ...TH, color: COLOR.inkSoft }}>
              Overall
            </th>
            <th scope="col" style={{ ...TH, textAlign: 'right' }}>
              Sessions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  fontSize: 12.5,
                  fontWeight: 650,
                  color: COLOR.inkSoft,
                  paddingRight: 10,
                  maxWidth: 230,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={r.label}
              >
                {r.label}
              </th>
              {SKILL_KEYS.map((k) => (
                <Cell
                  key={k}
                  value={r.withSkills > 0 ? r.skills[k] : null}
                  outlined={hardest?.key === r.key && hardest.skill === k}
                  title={
                    r.skills[k] == null
                      ? `${r.label} · ${SKILL_LABELS[k]}: no skill scores`
                      : `${r.label} · ${SKILL_LABELS[k]}: ${Math.round(r.skills[k] as number)} (${bandWord(r.skills[k] as number)}) across ${r.withSkills} session${r.withSkills === 1 ? '' : 's'}`
                  }
                />
              ))}
              <Cell
                value={r.overall}
                strong
                title={`${r.label} · overall: ${r.overall == null ? '—' : Math.round(r.overall)} across ${r.scored} scored session${r.scored === 1 ? '' : 's'}`}
              />
              <td
                style={{
                  textAlign: 'right',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: COLOR.inkSoft,
                  fontVariantNumeric: 'tabular-nums',
                  paddingLeft: 8,
                }}
              >
                {r.scored}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverLabel({ driver, suffix }: { driver: DriverKey; suffix?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DRIVERS[driver].color, flexShrink: 0 }} />
      {driver}
      {suffix}
    </span>
  );
}

/**
 * Trainee ECHO style (rows) × AI owner style (columns): average score with
 * at least `min` scored sessions, else "—". Counts are in each cell's title.
 */
export function MatchupGrid({
  drivers,
  cell,
  min = 2,
}: {
  drivers: readonly DriverKey[];
  cell: (trainee: DriverKey, owner: DriverKey) => { avgScore: number | null; scored: number } | undefined;
  min?: number;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="pbt-sk-table" style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', minWidth: 380 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Average score by trainee style and owner style
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...TH, textAlign: 'left', paddingLeft: 0, textTransform: 'none', letterSpacing: 0, fontWeight: 650 }}>
              Trainee ↓ · Owner →
            </th>
            {drivers.map((d) => (
              <th key={d} scope="col" style={{ ...TH, textTransform: 'none', letterSpacing: 0, fontSize: 11.5, fontWeight: 700, color: COLOR.inkSoft }}>
                <DriverLabel driver={d} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map((t) => (
            <tr key={t}>
              <th scope="row" style={{ textAlign: 'left', fontSize: 12, fontWeight: 700, color: COLOR.inkSoft, paddingRight: 8 }}>
                <DriverLabel driver={t} />
              </th>
              {drivers.map((o) => {
                const c = cell(t, o);
                const enough = c != null && c.avgScore != null && c.scored >= min;
                return (
                  <Cell
                    key={o}
                    value={enough ? (c?.avgScore as number) : null}
                    title={
                      c == null || c.scored === 0
                        ? `${t} trainees vs ${o} owners: no scored sessions`
                        : enough
                          ? `${t} trainees vs ${o} owners: ${Math.round(c.avgScore as number)} across ${c.scored} sessions`
                          : `${t} trainees vs ${o} owners: only ${c.scored} session — too few to average`
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
