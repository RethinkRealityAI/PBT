/**
 * Simulation configuration — the admin-editable layer that lets the dashboard
 * tune what drives the AI customer + scorer at runtime, WITHOUT a code deploy.
 *
 * Everything here is OPTIONAL and deep-merged over the hardcoded code defaults
 * (scoringRubric / driverProfiles / pushbackTaxonomy). If no config is supplied
 * — or a field is absent — the code default is used, so the simulation behaves
 * exactly as before. The resolved values feed `promptBuilders` (customer +
 * scoring prompts) and the score weighting.
 *
 * Delivery: this object rides the existing flags snapshot
 * (`flags-resolve` → FlagProvider) the same way scenario overrides do.
 */
import { DIMENSIONS, dimensionWeights, type DimensionKey } from './scoringRubric';
import { DRIVER_KNOWLEDGE, type DriverKnowledge } from './driverProfiles';
import {
  PUSHBACK_KNOWLEDGE,
  type PushbackKnowledge,
} from './pushbackTaxonomy';
import type { DriverKey } from '../../design-system/tokens';

/** Admin-editable overrides for a single scoring dimension. Key is fixed. */
export interface ScoringDimensionConfig {
  key: DimensionKey;
  label?: string;
  description?: string;
  /** Raw weight; resolved weights are normalised to sum 1.0 across dimensions. */
  weight?: number;
  excellentExample?: string;
  needsWorkExample?: string;
}

export interface SimulationConfig {
  scoring?: {
    dimensions?: ScoringDimensionConfig[];
    /** Injected at the top of the scoring system prompt. */
    promptPrefix?: string;
    /** Appended to the scoring system prompt. */
    promptSuffix?: string;
  };
  /** Per-driver persona knowledge overrides (partial — only changed fields). */
  drivers?: Partial<Record<DriverKey, Partial<DriverKnowledge>>>;
  /** Pushback taxonomy overrides/additions, keyed by pushback id. */
  pushbacks?: Record<string, Partial<PushbackKnowledge>>;
  /** Global customer-prompt wraps (applied to every scenario, on top of per-scenario ones). */
  customerPromptPrefix?: string;
  customerPromptSuffix?: string;
}

export interface ResolvedDimension {
  key: DimensionKey;
  label: string;
  description: string;
  weight: number;
  excellentExample: string;
  needsWorkExample: string;
}

const EMPTY: SimulationConfig = {};

/**
 * Resolve the scoring dimensions: code defaults with admin overrides merged in
 * by key. Dimension KEYS are fixed (the ScoreReport schema is typed) — admin
 * can edit a dimension's label/description/weight/examples but not add/remove
 * keys. Unknown keys in config are ignored.
 */
export function resolveDimensions(config: SimulationConfig = EMPTY): ResolvedDimension[] {
  const overrides = new Map(
    (config.scoring?.dimensions ?? []).map((d) => [d.key, d]),
  );
  return DIMENSIONS.map((d) => {
    const o = overrides.get(d.key);
    return {
      key: d.key,
      label: o?.label?.trim() || d.label,
      description: o?.description?.trim() || d.description,
      weight:
        typeof o?.weight === 'number' && o.weight >= 0 ? o.weight : d.weight,
      excellentExample: o?.excellentExample?.trim() || d.bands.excellent.example,
      needsWorkExample: o?.needsWorkExample?.trim() || d.bands.needsWork.example,
    };
  });
}

/**
 * Resolved per-dimension weights, NORMALISED to sum to 1.0. If an admin enters
 * weights that don't sum to one, we scale them proportionally so the overall
 * score stays a clean 0–100 weighted average. Falls back to code weights
 * (which already sum to 1.0) when no config is present.
 */
export function resolveWeights(
  config: SimulationConfig = EMPTY,
): Record<DimensionKey, number> {
  const dims = resolveDimensions(config);
  const total = dims.reduce((s, d) => s + (d.weight > 0 ? d.weight : 0), 0);
  // Safety net: an all-zero (or negative) weighting would make every session
  // score 0. Fall back to the code defaults rather than silently break scoring.
  if (total <= 0) return dimensionWeights();
  const out = {} as Record<DimensionKey, number>;
  for (const d of dims) {
    out[d.key] = d.weight > 0 ? d.weight / total : 0;
  }
  return out;
}

/** Resolve a single driver's persona knowledge with admin overrides merged in. */
export function resolveDriverKnowledge(
  driver: DriverKey,
  config: SimulationConfig = EMPTY,
): DriverKnowledge {
  const base = DRIVER_KNOWLEDGE[driver];
  const o = config.drivers?.[driver];
  if (!o) return base;
  const arr = (override: string[] | undefined, fallback: string[]) =>
    Array.isArray(override) && override.length > 0 ? override : fallback;
  return {
    motivation: o.motivation?.trim() || base.motivation,
    communicationStyle: arr(o.communicationStyle, base.communicationStyle),
    strengths: arr(o.strengths, base.strengths),
    stressSignature: o.stressSignature?.trim() || base.stressSignature,
    recognitionCues: arr(o.recognitionCues, base.recognitionCues),
    flexingTips: arr(o.flexingTips, base.flexingTips),
    customerSamplePhrasings: arr(
      o.customerSamplePhrasings,
      base.customerSamplePhrasings,
    ),
  };
}

/**
 * Resolve a pushback's taxonomy knowledge. Returns the merged code default +
 * admin override, OR an admin-authored entry for a brand-new pushback id that
 * has no code default. Returns undefined only when neither exists.
 */
export function resolvePushbackKnowledge(
  id: string,
  config: SimulationConfig = EMPTY,
): PushbackKnowledge | undefined {
  const base = PUSHBACK_KNOWLEDGE[id];
  const o = config.pushbacks?.[id];
  if (!base && !o) return undefined;
  const arr = (override: string[] | undefined, fallback: string[] | undefined) =>
    Array.isArray(override) && override.length > 0 ? override : fallback ?? [];
  return {
    id,
    title: o?.title?.trim() || base?.title || id,
    examples: arr(o?.examples, base?.examples),
    rootConcerns: arr(o?.rootConcerns, base?.rootConcerns),
    acknowledgePatterns: arr(o?.acknowledgePatterns, base?.acknowledgePatterns),
    clarifyQuestions: arr(o?.clarifyQuestions, base?.clarifyQuestions),
    takeActionPatterns: arr(o?.takeActionPatterns, base?.takeActionPatterns),
    watchOuts: arr(o?.watchOuts, base?.watchOuts),
  };
}

/** Defaults serialised for the admin editor's "reset to default" + initial form. */
export function defaultSimulationConfig(): Required<
  Pick<SimulationConfig, 'scoring' | 'drivers' | 'pushbacks'>
> {
  return {
    scoring: {
      dimensions: DIMENSIONS.map((d) => ({
        key: d.key,
        label: d.label,
        description: d.description,
        weight: d.weight,
        excellentExample: d.bands.excellent.example,
        needsWorkExample: d.bands.needsWork.example,
      })),
      promptPrefix: '',
      promptSuffix: '',
    },
    drivers: { ...DRIVER_KNOWLEDGE },
    pushbacks: Object.fromEntries(
      Object.entries(PUSHBACK_KNOWLEDGE),
    ) as Record<string, PushbackKnowledge>,
  };
}
