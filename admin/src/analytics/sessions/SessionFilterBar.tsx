/**
 * The Sessions tab's one filter row: outcome chips (with the count each would
 * give) and the selects that narrow by how and what was practised. Options
 * come from the window's own data where they vary (objections), so the
 * Objection list never offers something that can only return nothing.
 */
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { difficultyLabel } from '../../lib/difficulty';
import { ChipFilter, SelectFilter } from '../ui';
import {
  OUTCOME_FILTERS,
  OUTCOME_FILTER_LABELS,
  SOURCE_LABELS,
  objectionOptions,
  outcomeCounts,
  type OutcomeFilter,
  type SessionFilters,
} from '../lib/sessionsExplorer';

export function SessionFilterBar({
  rows,
  chipBase,
  filters,
  onChange,
  onClear,
  active,
}: {
  /** The window's sessions — the source of the select options. */
  rows: readonly SessionSummary[];
  /** The rows the chips count over (every filter but the chip itself). */
  chipBase: readonly SessionSummary[];
  filters: SessionFilters;
  onChange: (f: SessionFilters) => void;
  onClear: () => void;
  /** Filters + search in effect; "Clear filters" shows when > 0. */
  active: number;
}) {
  const counts = outcomeCounts(chipBase);
  const set = <K extends keyof SessionFilters>(k: K, v: SessionFilters[K]) => onChange({ ...filters, [k]: v });
  const objections = objectionOptions(rows);
  const sources = (['library', 'studio', 'self-built'] as const).filter((k) => rows.some((s) => s.scenario_source === k));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px' }}>
      <ChipFilter<OutcomeFilter>
        label="Outcome"
        value={filters.outcome}
        onChange={(v) => set('outcome', v)}
        options={OUTCOME_FILTERS.map((k) => ({ key: k, label: OUTCOME_FILTER_LABELS[k], count: counts[k] }))}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <SelectFilter
          label="Mode"
          value={filters.mode}
          onChange={(v) => set('mode', v as SessionFilters['mode'])}
          options={[
            { value: 'all', label: 'Any' },
            { value: 'text', label: 'Typed' },
            { value: 'voice', label: 'Spoken' },
          ]}
        />
        <SelectFilter
          label="Difficulty"
          value={filters.difficulty}
          onChange={(v) => set('difficulty', v)}
          options={[
            { value: 'all', label: 'Any' },
            ...([1, 2, 3, 4] as const).map((l) => ({ value: String(l), label: difficultyLabel(l) })),
          ]}
        />
        <SelectFilter
          label="Objection"
          value={filters.objection}
          onChange={(v) => set('objection', v)}
          options={[{ value: 'all', label: 'Any' }, ...objections.map((o) => ({ value: o.value, label: o.label }))]}
        />
        <SelectFilter
          label="Animal"
          value={filters.species}
          onChange={(v) => set('species', v as SessionFilters['species'])}
          options={[
            { value: 'all', label: 'Any' },
            { value: 'dog', label: 'Dog' },
            { value: 'cat', label: 'Cat' },
          ]}
        />
        <SelectFilter
          label="Source"
          value={filters.source}
          onChange={(v) => set('source', v as SessionFilters['source'])}
          options={[{ value: 'all', label: 'Any' }, ...sources.map((k) => ({ value: k, label: SOURCE_LABELS[k] }))]}
        />
        {active > 0 && (
          <button
            type="button"
            className="pbt-link"
            onClick={onClear}
            style={{ fontSize: 12, color: COLOR.brand, marginLeft: 2 }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
