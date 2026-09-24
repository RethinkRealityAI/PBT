/**
 * Tag assistant internals — the prompt that offers the model our vocabularies
 * and the normaliser that forces its answer back into them.
 *
 * Kept apart from the HTTP shell (`admin-knowledge-analyze.ts`) so both halves
 * stay small and the vocabulary wiring is obvious: every focus area, tool and
 * species the admin can pick is listed here WITH its description, and nothing
 * the model invents survives `normalizeKnowledgeAnalysis`.
 */
import { Type } from '@google/genai';
import { FOCUS_AREAS, isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import {
  DEFAULT_KNOWLEDGE_TOOLS,
  KNOWLEDGE_SPECIES,
  KNOWLEDGE_SPECIES_KEYS,
  KNOWLEDGE_TOOLS,
  KNOWLEDGE_TOOL_KEYS,
  normalizeKnowledgeSpecies,
  normalizeKnowledgeTools,
} from '../../../src/shared/knowledge/knowledgeScopes';
import {
  ANALYZE_MODEL_CHARS,
  MAX_ANALYZE_TOPICS,
  type KnowledgeAnalysis,
} from '../../../src/shared/knowledge/knowledgeAnalyze';

const bullet = (key: string, label: string, description: string) =>
  `- \`${key}\` — ${label}: ${description}`;

/**
 * The system instruction. Lists every vocabulary key with its description and
 * the placement rules. Written once per request (cheap) so a vocabulary edit
 * is live without touching this file.
 */
export function buildKnowledgeAnalyzeSystemPrompt(): string {
  const focus = FOCUS_AREAS.map((f) => bullet(f.key, f.label, f.description)).join('\n');
  const tools = KNOWLEDGE_TOOLS.map((t) => bullet(t.key, t.label, t.description)).join('\n');
  const species = KNOWLEDGE_SPECIES.map((s) => bullet(s.key, s.label, s.description)).join('\n');
  const defaults = DEFAULT_KNOWLEDGE_TOOLS.map((k) => `\`${k}\``).join(', ');

  return [
    'You are the filing assistant for a veterinary clinic\'s training knowledge base.',
    'A clinic manager is adding a document. Read it and decide what it is and where it',
    'should be used, so the manager can confirm or change your suggestion. Write for a',
    'clinic manager, not an engineer: plain English, no jargon, no code words.',
    '',
    'FOCUS AREAS (`focus`) — the clinical topic. Choose exactly one key, or null when none fits:',
    focus,
    '',
    'TOOLS (`tools`) — which parts of the app may use this document ("Used by"):',
    tools,
    '',
    'SPECIES (`species`) — which animals it applies to:',
    species,
    '',
    'RULES',
    `1. Choose ONLY from the keys listed above. Never invent a key.`,
    `2. \`tools\` should be the training set — ${defaults} — unless the document is clearly`,
    '   stool / fecal-chart material (stool scoring, fecal consistency charts, stool photo',
    '   guidance). Only then use `fecal-scan`, and restrict `species` to what the text',
    '   actually covers.',
    '3. `species`: list every species the document covers. If it does not say, list all',
    '   three and add the warning "Species not stated — defaulted to all".',
    '4. `focus`: null when no listed area fits. Do not force one.',
    '5. `citation`: copy a short citation ONLY if the text states authors / year / source',
    '   (for example "Davies et al., 2024 — JAVMA"). If it is absent, use null. Never invent one.',
    '6. `category`: `clinical` for clinical or research guidance; `custom` for clinic-specific',
    '   notes, scripts, policies or anything else.',
    '7. `title`: a short, human title (use the given title hint if it is good).',
    '8. `summary`: 2–3 sentences saying what the document is and when a team member would',
    '   rely on it.',
    `9. \`topics\`: up to ${MAX_ANALYZE_TOPICS} short noun phrases.`,
    '10. `reasons`: one short sentence each for focus, tools and species, e.g. "Mentions',
    '    stool consistency and the Royal Canin fecal chart, so it belongs with Fecal Scan."',
    '11. `warnings`: anything the manager should double-check, e.g. "This looks like',
    '    marketing copy, not clinical guidance". Empty list when there is nothing to flag.',
    '12. `confidence`: 0 to 1 — how sure you are of the placement overall.',
    '',
    'Answer with JSON only.',
  ].join('\n');
}

/** Gemini JSON-mode schema for `KnowledgeAnalysis`. */
export const KNOWLEDGE_ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    category: { type: Type.STRING, enum: ['clinical', 'custom'] },
    focus: { type: Type.STRING, nullable: true },
    tools: { type: Type.ARRAY, items: { type: Type.STRING } },
    species: { type: Type.ARRAY, items: { type: Type.STRING } },
    citation: { type: Type.STRING, nullable: true },
    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER },
    reasons: {
      type: Type.OBJECT,
      properties: {
        focus: { type: Type.STRING },
        tools: { type: Type.STRING },
        species: { type: Type.STRING },
      },
      required: ['focus', 'tools', 'species'],
    },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'title',
    'summary',
    'category',
    'focus',
    'tools',
    'species',
    'citation',
    'topics',
    'confidence',
    'reasons',
    'warnings',
  ],
};

export interface PreparedContent {
  /** What the model reads. */
  text: string;
  /** True when `text` is a prefix of the original. */
  truncated: boolean;
}

/** Cut the document to the model window. */
export function prepareContentForModel(content: string): PreparedContent {
  const trimmed = content.trim();
  if (trimmed.length <= ANALYZE_MODEL_CHARS) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, ANALYZE_MODEL_CHARS), truncated: true };
}

/** The user turn: hints first, then the document. */
export function buildKnowledgeAnalyzeContents(args: {
  content: string;
  titleHint?: string;
  citationHint?: string;
}): string {
  const hints: string[] = [];
  if (args.titleHint?.trim()) hints.push(`Title hint (from the admin): ${args.titleHint.trim()}`);
  if (args.citationHint?.trim()) {
    hints.push(`Citation found during extraction: ${args.citationHint.trim()}`);
  }
  return [
    ...hints,
    '',
    'DOCUMENT START',
    args.content,
    'DOCUMENT END',
    '',
    'Analyse the document and answer with the JSON object.',
  ].join('\n');
}

const TRUNCATION_WARNING = `Only the first ${Math.round(ANALYZE_MODEL_CHARS / 1000)}k characters were read — check the suggestion against the rest.`;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : [];

function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export interface NormalizeAnalysisOptions {
  /** The extraction's citation — kept when the model returned none. */
  fallbackCitation?: string;
  /** Add the "only the first 40k" warning. */
  truncated?: boolean;
  /** Fallback title when the model gives none. */
  fallbackTitle?: string;
}

/**
 * Force a raw model answer into the vocabularies. Unknown tools are dropped
 * (defaults when nothing is left), unknown species likewise, an unknown focus
 * becomes null, confidence is clamped to [0, 1], topics capped and de-duped.
 */
export function normalizeKnowledgeAnalysis(
  raw: unknown,
  opts: NormalizeAnalysisOptions = {},
): KnowledgeAnalysis {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const rawTools = strList(r.tools);
  const tools = normalizeKnowledgeTools(rawTools);
  const rawSpecies = strList(r.species);
  const species = normalizeKnowledgeSpecies(rawSpecies);

  const warnings = strList(r.warnings);
  const speciesKnown = rawSpecies.filter((k) => KNOWLEDGE_SPECIES_KEYS.includes(k));
  if (speciesKnown.length === 0 && !warnings.some((w) => /species/i.test(w))) {
    warnings.push('Species not stated — defaulted to all.');
  }
  const toolsKnown = rawTools.filter((k) => KNOWLEDGE_TOOL_KEYS.includes(k));
  if (rawTools.length > 0 && toolsKnown.length === 0) {
    warnings.push('The suggested "Used by" was not recognised — defaulted to the training tools.');
  }
  if (opts.truncated) warnings.push(TRUNCATION_WARNING);

  const reasonsRaw =
    r.reasons && typeof r.reasons === 'object' ? (r.reasons as Record<string, unknown>) : {};

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const t of strList(r.topics)) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(t);
    if (topics.length >= MAX_ANALYZE_TOPICS) break;
  }

  const citation = str(r.citation) || str(opts.fallbackCitation) || null;

  return {
    title: str(r.title) || str(opts.fallbackTitle) || 'Untitled document',
    summary: str(r.summary),
    category: r.category === 'clinical' ? 'clinical' : 'custom',
    focus: isFocusAreaKey(r.focus) ? r.focus : null,
    tools,
    species,
    citation,
    topics,
    confidence: clamp01(r.confidence),
    reasons: {
      focus: str(reasonsRaw.focus),
      tools: str(reasonsRaw.tools),
      species: str(reasonsRaw.species),
    },
    warnings,
  };
}
