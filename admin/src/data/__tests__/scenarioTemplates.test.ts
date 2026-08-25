/**
 * Scenario templates — library integrity.
 *
 * Every template is a starting point the Scenario Builder applies onto a
 * fresh `admin:` draft, so each one must be a complete, valid dense row the
 * moment it lands: the same `validateOverride` gate the Netlify function
 * runs on save must pass with zero edits. Mirrors the conventions of
 * src/tests/adminScenarioDraft.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  SCENARIO_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type ScenarioTemplate,
  type TemplateCategoryKey,
} from '../scenarioTemplates';
import {
  validateOverride,
  type OverrideUpsert,
} from '../../../../netlify/functions/admin-scenario-overrides';

/** A template applied onto a fresh admin draft, as the save endpoint sees it. */
function asAdminUpsert(t: ScenarioTemplate): OverrideUpsert {
  return {
    scenario_id: 'admin:00000000-0000-0000-0000-000000000000',
    visible: false,
    sort_order: null,
    ...t.fields,
  };
}

describe('SCENARIO_TEMPLATES library shape', () => {
  it('has exactly 23 templates', () => {
    expect(SCENARIO_TEMPLATES).toHaveLength(23);
  });

  it('has unique ids', () => {
    const ids = SCENARIO_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template category is a declared category key', () => {
    const keys = new Set<TemplateCategoryKey>(TEMPLATE_CATEGORIES.map((c) => c.key));
    for (const t of SCENARIO_TEMPLATES) {
      expect(keys.has(t.category)).toBe(true);
    }
  });

  it('every category has at least 4 templates', () => {
    for (const { key } of TEMPLATE_CATEGORIES) {
      const count = SCENARIO_TEMPLATES.filter((t) => t.category === key).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('every template passes validateOverride as an admin dense row', () => {
  // Default options ⇒ the admin completeness rule applies too: breed,
  // life_stage, pushback_id, and suggested_driver must all be present.
  for (const t of SCENARIO_TEMPLATES) {
    it(`${t.id} validates`, () => {
      expect(validateOverride(asAdminUpsert(t))).toBeNull();
    });
  }
});

describe('template authoring rules', () => {
  it("every 'gi-*' template has focus_area 'gi'", () => {
    for (const t of SCENARIO_TEMPLATES.filter((x) => x.id.startsWith('gi-'))) {
      expect(t.fields.focus_area, t.id).toBe('gi');
    }
  });

  it('every gi-vet template reframes the roleplay via prompt_prefix', () => {
    const giVet = SCENARIO_TEMPLATES.filter((t) => t.category === 'gi-vet');
    expect(giVet.length).toBeGreaterThan(0);
    for (const t of giVet) {
      expect(t.fields.prompt_prefix, t.id).not.toBeNull();
    }
  });

  it('every template carries the full card + roleplay surface', () => {
    for (const t of SCENARIO_TEMPLATES) {
      expect(t.fields.card_title_override, t.id).not.toBeNull();
      expect(t.fields.card_subtitle_override, t.id).not.toBeNull();
      expect(t.fields.context_override, t.id).not.toBeNull();
      expect(t.fields.opening_line_override, t.id).not.toBeNull();
      expect(t.fields.info_modal_body, t.id).not.toBeNull();
    }
  });

  it("every 'custom' pushback describes its objection in pushback_notes", () => {
    for (const t of SCENARIO_TEMPLATES.filter((x) => x.fields.pushback_id === 'custom')) {
      expect(t.fields.pushback_notes, t.id).not.toBeNull();
      expect(t.fields.pushback_notes!.trim().length, t.id).toBeGreaterThan(0);
    }
  });
});
