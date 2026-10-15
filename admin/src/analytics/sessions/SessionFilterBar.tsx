/**
 * The Sessions tab's one filter row: outcome chips (with the count each would
 * give) and the selects that narrow by who practised, in which language, and
 * how and what. Options come from the window's own data where they vary
 * (objections), so the Objection list never offers something that can only
 * return nothing. "Ending not recorded" shows only when the window has one.
 */
import { objectionLabel } from '../lib/objectionNames';
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { difficultyLabel } from '../../lib/difficulty';
import { ChipFilter, SelectFilter } from '../ui';
import {
  OUTCOME_FILTERS,
  OUTCOME_FILTER_LABELS,
  objectionOptions,
  outcomeCounts,
  type OutcomeFilter,
  type SessionFilters,
} from '../lib/sessionsExplorer';
import { SCENARIO_SOURCE_LABELS } from '../lib/metrics';
import { WHO_FILTER_LABELS, languageLabel, languageOrder, type WhoFilter } from '../lib/who';

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
  // A choice made in another window stays selectable (and visibly selected) here.
  if (filters.objection !== 'all' && !objections.some((o) => o.value === filters.objection)) {
    objections.push({ value: filters.objection, label: objectionLabel(filters.objection), count: 0 });
  }
  const sources = (['library', 'studio', 'self-built', 'unknown'] as const).filter(
    (k) => k === filters.source || (k !== 'unknown' && rows.some((s) => s.scenario_source === k)),
  );
  const languages = languageOrder(rows);
  if (filters.language !== 'all' && !languages.includes(filters.language)) languages.push(filters.language);
  // An outcome nobody had is noise — except the one already selected.
  const outcomes = OUTCOME_FILTERS.filter((k) => k !== 'unknown' || counts.unknown > 0 || filters.outcome === 'unknown');

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px' }}>
      <ChipFilter<OutcomeFilter>
        label="Outcome"
        value={filters.outcome}
        onChange={(v) => set('outcome', v)}
        options={outcomes.map((k) => ({ key: k, label: OUTCOME_FILTER_LABELS[k], count: counts[k] }))}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <SelectFilter
          label="Who"
          value={filters.who}
          onChange={(v) => set('who', v as WhoFilter)}
          options={(['all', 'signed_in', 'anonymous'] as const).map((k) => ({ value: k, label: WHO_FILTER_LABELS[k] }))}
        />
        <SelectFilter
          label="Language"
          value={filters.language}
          onChange={(v) => set('language', v)}
          options={[{ value: 'all', label: 'Any' }, ...languages.map((k) => ({ value: k, label: languageLabel(k) }))]}
        />
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
          options={[{ value: 'all', label: 'Any' }, ...sources.map((k) => ({ value: k, label: SCENARIO_SOURCE_LABELS[k] }))]}
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
