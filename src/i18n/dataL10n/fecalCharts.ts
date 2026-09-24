import type {
  FecalChartEntry,
  FecalSpecies,
} from '../../data/knowledge/fecalCharts';
import { FECAL_CHARTS } from '../../data/knowledge/fecalCharts';
import { getDataOverlay } from '../dataRegistry';
import type { Locale } from '../locales';

/**
 * Display-only localization for the Royal Canin fecal scoring charts.
 *
 * Key indirection, per src/i18n/dataRegistry.ts: `fecalCharts.ts` stays the
 * canonical English source — it is what the knowledge base is seeded from and
 * what the scoring function reasons over, so it is never mutated. Only the
 * prose a user reads (`title`, `subtitle`, `directions`, and each entry's
 * `label` + `description`) is overlaid; scores, bands and image paths are
 * data/identity and pass straight through. English registers no overlay and
 * therefore returns the canonical text.
 *
 * The French puppy chart text is VERBATIM from the FR edition of the chart
 * (VGI/066/0324); the dog and cat charts are translated in the same register.
 */

/** The user-facing fields of one chart row. */
export interface FecalEntryDisplay {
  label: string;
  description: string;
}

/**
 * One localized chart. `K` is the set of score keys THAT chart defines, so a
 * locale that forgets the dog chart's 3.5 row fails `tsc` at the overlay's
 * definition site rather than silently falling back to English.
 */
export interface FecalChartDisplay<K extends string> {
  title: string;
  subtitle?: string;
  directions: string;
  entries: Record<K, FecalEntryDisplay>;
}

type DogScoreKey = '1' | '2' | '2.5' | '3' | '3.5' | '4' | '4.5' | '5';
type CatScoreKey = '1' | '2' | '2.5' | '3' | '4' | '5';
type PuppyScoreKey = '1' | '2' | '2.5' | '3' | '4' | '4.5' | '5';

export interface FecalChartsOverlay {
  dog: FecalChartDisplay<DogScoreKey>;
  cat: FecalChartDisplay<CatScoreKey>;
  puppy: FecalChartDisplay<PuppyScoreKey>;
}

function overlay(locale: Locale): FecalChartsOverlay | undefined {
  return getDataOverlay<FecalChartsOverlay>(locale, 'fecalCharts');
}

/**
 * The chart row as the given locale should display it. Returns the canonical
 * English fields when the locale has no overlay (English, or a catalog that
 * hasn't finished loading).
 */
export function localizedFecalEntry(
  locale: Locale,
  species: FecalSpecies,
  entry: FecalChartEntry,
): FecalEntryDisplay {
  const chart = overlay(locale)?.[species] as
    | FecalChartDisplay<string>
    | undefined;
  const text = chart?.entries[String(entry.score)];
  return text ?? { label: entry.label, description: entry.description };
}

/** Chart heading text (title / subtitle / directions) for the locale. */
export function localizedFecalChartMeta(
  locale: Locale,
  species: FecalSpecies,
): { title: string; subtitle?: string; directions: string } {
  const canonical = FECAL_CHARTS[species];
  const chart = overlay(locale)?.[species] as
    | FecalChartDisplay<string>
    | undefined;
  if (!chart) {
    return {
      title: canonical.title,
      subtitle: canonical.subtitle,
      directions: canonical.directions,
    };
  }
  return {
    title: chart.title,
    subtitle: chart.subtitle ?? canonical.subtitle,
    directions: chart.directions,
  };
}
