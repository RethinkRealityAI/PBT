/**
 * Suggestion engine for the Scenario Builder's AI wizard.
 *
 * The wizard sends the partially-filled scenario as context and asks for
 * 3 short suggestions for the current field. The Gemini call (and the
 * research grounding that feeds it) happens in the `admin-scenario-ai`
 * Netlify Function, which holds the key and requires `scenarios.write` —
 * the admin browser only forwards its Supabase JWT, like every other admin
 * data call (`lib/api.ts`).
 */
import { postJson } from './api';
import {
  AI_ENDPOINTS,
  type ScenarioSuggestRequest,
  type ScenarioSuggestResponse,
} from '../../../src/shared/ai/contract';
import type { ScenarioDraftForAi, WizardField } from '../../../src/shared/ai/scenarioWizard';

export type { ScenarioDraftForAi, WizardField } from '../../../src/shared/ai/scenarioWizard';

/** `postJson` takes the function name; the contract stores the full path. */
const SUGGEST_FUNCTION = AI_ENDPOINTS.scenarioSuggest.slice(
  AI_ENDPOINTS.scenarioSuggest.lastIndexOf('/') + 1,
);

export async function suggestField(
  field: WizardField,
  draft: ScenarioDraftForAi,
): Promise<string[]> {
  const body: ScenarioSuggestRequest = { field, draft };
  const res = await postJson<ScenarioSuggestResponse>(SUGGEST_FUNCTION, body);
  return Array.isArray(res.suggestions)
    ? res.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : [];
}
