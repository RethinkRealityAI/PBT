import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreateScreen } from '../CreateScreen';
import type { Scenario } from '../../data/scenarios';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';
import type { TeamObjection } from '../../shared/scenarios/objections';
import {
  BUILT_IN_CATEGORIES,
  type ObjectionCategory,
} from '../../shared/scenarios/objectionCategories';
import { POPULAR_BREEDS } from '../../shared/scenarios/species';
import { LanguageProvider } from '../../app/providers/LanguageProvider';
import { loadCatalog } from '../../i18n/translate';

const { go, back, setScenario, persistUserScenario, logEvent } = vi.hoisted(() => ({
  go: vi.fn(),
  back: vi.fn(),
  setScenario: vi.fn(),
  persistUserScenario: vi.fn(),
  logEvent: vi.fn(),
}));

/** The flag snapshot the screen sees (team objections + scenario overrides). */
let flagSnapshot: FlagSnapshot | null = null;
/** Admin → Flags values for the test (`scenario.cat.enabled` is OFF by default). */
let flagValues: Record<string, unknown> = {};

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go, back, replace: vi.fn(), current: 'create', history: [] }),
}));
vi.mock('../../app/providers/ScenarioProvider', () => ({
  useScenario: () => ({ scenario: null, setScenario }),
}));
vi.mock('../../features/scenarios/persistScenario', () => ({ persistUserScenario }));
vi.mock('../../lib/analytics', () => ({ logEvent }));
vi.mock('../../app/providers/FlagProvider', async () => {
  const actual = await vi.importActual<typeof import('../../app/providers/FlagProvider')>(
    '../../app/providers/FlagProvider',
  );
  const { findOverride } = await vi.importActual<typeof import('../../services/flagsClient')>(
    '../../services/flagsClient',
  );
  return {
    ...actual,
    useFlags: () => ({
      snapshot: flagSnapshot,
      preview: null,
      ready: true,
      refresh: async () => {},
      getFlag: <T,>(key: string, fallback: T) => (key in flagValues ? (flagValues[key] as T) : fallback),
      getOverride: (id: string) => findOverride(flagSnapshot, id),
      getSimulationConfig: () => null,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const OBJECTION: Omit<TeamObjection, 'id' | 'title' | 'species' | 'categoryId'> = {
  example: '"A line."',
  titleFr: null,
  exampleFr: null,
  coaching: {},
  coachingFr: {},
  visible: true,
  sortOrder: null,
  updatedAt: null,
};
const CATEGORY: Omit<ObjectionCategory, 'id' | 'name'> = {
  nameFr: null,
  description: '',
  focusArea: null,
  knowledgeSlugs: [],
  sortOrder: null,
  builtIn: false,
  updatedAt: null,
};
/** Team category for dogs (has a French name), with knowledge attached. */
const GI: ObjectionCategory = {
  ...CATEGORY,
  id: 'category:gi',
  name: 'GI',
  nameFr: 'Gastro-intestinal',
  description: 'Stomach and gut health.',
  focusArea: 'gi',
  knowledgeSlugs: ['study:gi'],
  sortOrder: 40,
};
/** Team category for cats (no French name). */
const URINARY: ObjectionCategory = { ...CATEGORY, id: 'category:urinary', name: 'Urinary', sortOrder: 50 };
const PROBIOTICS: TeamObjection = {
  ...OBJECTION,
  id: 'team:probiotics',
  title: "Probiotics: 'he doesn't need them'",
  example: '"He eats fine — why a probiotic?"',
  species: ['dog'],
  categoryId: 'category:gi',
  sortOrder: 1,
};
const WET_FOOD: TeamObjection = {
  ...OBJECTION,
  id: 'team:wet-food',
  title: 'Wet food is a waste',
  example: '"She does fine on kibble."',
  species: ['cat'],
  categoryId: 'category:urinary',
  sortOrder: 2,
};
const RETIRED: TeamObjection = {
  ...OBJECTION,
  id: 'team:retired',
  title: 'Retired topic',
  species: ['dog', 'cat'],
  categoryId: 'everyday-nutrition',
  visible: false,
};

const ROW: ScenarioOverride = {
  scenario_id: 'admin:x',
  visible: true,
  sort_order: null,
  title_override: null,
  context_override: null,
  opening_line_override: null,
  difficulty_override: null,
  persona_override: null,
  prompt_prefix: null,
  prompt_suffix: null,
  card_title_override: null,
  card_subtitle_override: null,
  info_modal_title: null,
  info_modal_body: null,
  start_button_label: null,
  card_driver_override: null,
  breed: null,
  life_stage: null,
  pushback_id: null,
  pushback_notes: null,
  suggested_driver: null,
  weight_kg: null,
};
const ADMIN_CAT: ScenarioOverride = {
  ...ROW,
  scenario_id: 'admin:cat-1',
  breed: 'Maine Coon',
  life_stage: 'Puppy (<1)',
  pushback_id: 'team:wet-food',
  suggested_driver: 'Harmonizer',
  species: 'cat',
  card_title_override: 'Kitten on dry food',
};
const ADMIN_DOG_PROBIOTICS: ScenarioOverride = {
  ...ROW,
  scenario_id: 'admin:dog-1',
  breed: 'Beagle',
  life_stage: 'Adult (3-7)',
  pushback_id: 'team:probiotics',
  suggested_driver: 'Energizer',
};
/** The admin hid the cost seed (seed:1). */
const HIDDEN_SEED: ScenarioOverride = { ...ROW, scenario_id: 'seed:1', visible: false };

function snapshot(
  overrides: ScenarioOverride[],
  objections: TeamObjection[] = [PROBIOTICS, WET_FOOD, RETIRED],
  objectionCategories: ObjectionCategory[] = [GI, URINARY],
): FlagSnapshot {
  return { flags: {}, scenarioOverrides: overrides, objections, objectionCategories, fetchedAt: 0 };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const animalTab = (name: 'Dog' | 'Cat') =>
  within(screen.getByRole('tablist', { name: 'Animal to train on' })).getByRole('tab', { name });
const breedInput = () => screen.getByRole('textbox', { name: 'Breed' }) as HTMLInputElement;
const chip = (name: string) => screen.queryByRole('button', { name });
const categoryGroup = () => screen.getByRole('group', { name: 'Choose a category' });
const categoryChips = () =>
  within(categoryGroup())
    .getAllByRole('button')
    .map((b) => b.textContent);
const categoryChip = (name: string) => within(categoryGroup()).getByRole('button', { name });
const trigger = () => screen.getByRole('button', { name: 'Select pushback type' });

async function openObjectionDropdown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Select pushback type' }));
}

/** Is an objection offered in the open dropdown? (Its option's name = title + example.) */
const offered = (title: string) =>
  screen.queryAllByRole('button').some((b) => (b.textContent ?? '').startsWith(title));

beforeEach(() => {
  vi.clearAllMocks();
  flagSnapshot = snapshot([HIDDEN_SEED, ADMIN_CAT, ADMIN_DOG_PROBIOTICS]);
  // Most of these tests exercise both animals: switch cats on. The
  // "dogs only" block below runs with the switch off (the shipped default).
  flagValues = { 'scenario.cat.enabled': true };
});

// ── Build tab ─────────────────────────────────────────────────────────────

describe('CreateScreen — which animal (Build tab)', () => {
  it('opens on Build with Dog chosen and dog breed suggestions — and no view toggle', () => {
    render(<CreateScreen />);
    // The Build | Ready-made underline toggle is gone from the top of the screen.
    expect(screen.queryByRole('tablist', { name: 'Scenario tabs' })).toBeNull();
    expect(screen.getByText('Build a scenario')).toBeInTheDocument();
    expect(animalTab('Dog')).toHaveAttribute('aria-selected', 'true');
    expect(breedInput().value).toBe(POPULAR_BREEDS.dog[0]);
    expect(chip(POPULAR_BREEDS.dog[1])).not.toBeNull();
    expect(chip('Maine Coon')).toBeNull();
    expect(screen.getByLabelText("Dog's weight (optional)")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Puppy (<1)' })).toBeInTheDocument();
  });

  it('switching to Cat swaps the breed chips, the default breed, labels and life stages — and is remembered', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(animalTab('Cat'));
    expect(animalTab('Cat')).toHaveAttribute('aria-selected', 'true');
    expect(breedInput().value).toBe(POPULAR_BREEDS.cat[0]);
    expect(chip('Maine Coon')).toHaveAttribute('aria-pressed', 'false');
    expect(chip(POPULAR_BREEDS.dog[1])).toBeNull();
    expect(breedInput()).toHaveAttribute('placeholder', 'Search cat breeds');
    expect(screen.getByLabelText("Cat's weight (optional)")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kitten (<1)' })).toBeInTheDocument();
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');
  });

  it('keeps a breed the trainee typed when the animal changes', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.clear(breedInput());
    await user.type(breedInput(), 'Shiba Inu');
    await user.click(animalTab('Cat'));
    expect(breedInput().value).toBe('Shiba Inu');
  });

  it('draws a pet icon (no emoji) on each animal tab', () => {
    render(<CreateScreen />);
    for (const name of ['Dog', 'Cat'] as const) {
      const tab = animalTab(name);
      expect(tab.querySelector('svg')).not.toBeNull();
      expect(tab).toHaveTextContent(new RegExp(`^${name}$`));
    }
  });

  it('offers only the categories holding a visible objection for the animal', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    // GI holds a dog-only objection, Urinary a cat-only one.
    expect(categoryChips()).toEqual([
      'Everyday nutrition',
      'Weight management',
      'Prescription diets',
      'GI',
    ]);
    // Opens on the first category, with its description.
    expect(categoryChip('Everyday nutrition')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(BUILT_IN_CATEGORIES[0].description)).toBeInTheDocument();

    await user.click(animalTab('Cat'));
    expect(categoryChips()).toEqual([
      'Everyday nutrition',
      'Weight management',
      'Prescription diets',
      'Urinary',
    ]);
  });

  it('category chips scope the objection dropdown (never offering a retired objection)', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await openObjectionDropdown(user);
    for (const title of [
      'Cost / price pushback',
      'Friend / breeder said…',
      'Grain-free / trend belief',
      'Switching brands hesitation',
    ]) {
      expect(offered(title), title).toBe(true);
    }
    expect(offered('Weight / obesity denial')).toBe(false);
    expect(offered(PROBIOTICS.title)).toBe(false);
    expect(offered(RETIRED.title)).toBe(false);

    // Picking a category picks its first objection and scopes the dropdown.
    await user.click(categoryChip('GI'));
    expect(categoryChip('GI')).toHaveAttribute('aria-pressed', 'true');
    expect(trigger()).toHaveTextContent(PROBIOTICS.title);
    expect(screen.getByText(GI.description)).toBeInTheDocument();
    await openObjectionDropdown(user);
    expect(offered(PROBIOTICS.title)).toBe(true);
    expect(offered('Cost / price pushback')).toBe(false);

    await user.click(categoryChip('Weight management'));
    expect(trigger()).toHaveTextContent('Weight / obesity denial');
  });

  it('category chips are a keyboard-usable group of toggle buttons', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    const gi = categoryChip('GI');
    gi.focus();
    await user.keyboard('{Enter}');
    expect(gi).toHaveAttribute('aria-pressed', 'true');
    const rx = categoryChip('Prescription diets');
    rx.focus();
    await user.keyboard(' ');
    expect(rx).toHaveAttribute('aria-pressed', 'true');
    expect(gi).toHaveAttribute('aria-pressed', 'false');
    expect(trigger()).toHaveTextContent('Skepticism on Rx diet');
  });

  it("a cat-only objection's category appears only under Cat", async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    expect(within(categoryGroup()).queryByRole('button', { name: 'Urinary' })).toBeNull();
    await user.click(animalTab('Cat'));
    await user.click(categoryChip('Urinary'));
    expect(trigger()).toHaveTextContent(WET_FOOD.title);
    await openObjectionDropdown(user);
    expect(offered(WET_FOOD.title)).toBe(true);
    expect(offered(PROBIOTICS.title)).toBe(false);
  });

  it('resets a category and objection that do not apply to the new animal', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(categoryChip('GI'));
    expect(trigger()).toHaveTextContent(PROBIOTICS.title);
    await user.click(animalTab('Cat'));
    // GI has nothing for cats → the first category, and its first objection.
    expect(categoryChip('Everyday nutrition')).toHaveAttribute('aria-pressed', 'true');
    expect(trigger()).toHaveTextContent('Cost / price pushback');
  });

  it('keeps the category and objection when they apply to the new animal too', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(categoryChip('Weight management'));
    await user.click(animalTab('Cat'));
    expect(categoryChip('Weight management')).toHaveAttribute('aria-pressed', 'true');
    expect(trigger()).toHaveTextContent('Weight / obesity denial');
  });

  it('builds a cat scenario carrying species and the team objection — never its knowledge', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(animalTab('Cat'));
    await user.click(categoryChip('Urinary'));
    await user.click(screen.getAllByRole('button', { name: 'Start scenario' })[0]);

    expect(setScenario).toHaveBeenCalledTimes(1);
    const built = setScenario.mock.calls[0][0] as Scenario;
    expect(built.species).toBe('cat');
    expect(built.breed).toBe(POPULAR_BREEDS.cat[0]);
    // The category's knowledge is applied server-side, not copied here.
    expect(built).not.toHaveProperty('focusArea');
    expect(built).not.toHaveProperty('knowledgeSlugs');
    expect(built.pushback).toEqual({
      id: 'team:wet-food',
      title: WET_FOOD.title,
      example: WET_FOOD.example,
    });
    expect(persistUserScenario).toHaveBeenCalledWith(built);
    expect(go).toHaveBeenCalledWith('chat');
  });

  it('"Other pushback" stays a separate choice outside every category', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(categoryChip('GI'));
    await user.click(screen.getByRole('button', { name: 'Other pushback' }));
    await user.type(screen.getByPlaceholderText(/They insisted/), 'Home-cooked only.');
    await user.click(screen.getAllByRole('button', { name: 'Start scenario' })[0]);
    const built = setScenario.mock.calls[0][0] as Scenario;
    expect(built.pushback.id).toBe('custom');
    expect(built.pushbackNotes).toBe('Home-cooked only.');
  });

  it('a dog scenario on a built-in objection carries NO species / focusArea keys (byte-identical prompts)', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(screen.getAllByRole('button', { name: 'Start scenario' })[0]);
    const built = setScenario.mock.calls[0][0] as Scenario;
    expect(built).not.toHaveProperty('species');
    expect(built).not.toHaveProperty('focusArea');
    expect(built.pushback.id).toBe('cost');
  });
});

// ── Dogs only (cats switched off — the shipped default) ───────────────────

describe('CreateScreen — dogs only while scenario.cat.enabled is off', () => {
  beforeEach(() => {
    flagValues = {};
  });

  it('asks no "Which animal?" and builds a dog, whatever the device stored', async () => {
    // A preference saved while cats were on must not leak a cat build.
    localStorage.setItem('pbt:train_species', '"cat"');
    const user = userEvent.setup();
    render(<CreateScreen />);
    expect(screen.queryByRole('tablist', { name: 'Animal to train on' })).toBeNull();
    expect(screen.queryByText('Which animal?')).toBeNull();
    expect(breedInput().value).toBe(POPULAR_BREEDS.dog[0]);
    expect(screen.getByLabelText("Dog's weight (optional)")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Puppy (<1)' })).toBeInTheDocument();
    // The stored preference is kept for when the switch comes back on.
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');

    await user.click(screen.getAllByRole('button', { name: 'Start scenario' })[0]);
    const built = setScenario.mock.calls[0][0] as Scenario;
    expect(built.species).toBeUndefined();
    expect(built.breed).toBe(POPULAR_BREEDS.dog[0]);
  });

  it('offers only dog categories and objections', () => {
    render(<CreateScreen />);
    const chips = within(screen.getByRole('group', { name: 'Choose a category' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(chips).toContain('GI');
    expect(chips).not.toContain('Urinary');
  });

});

// ── French ────────────────────────────────────────────────────────────────

describe('CreateScreen — French', () => {
  async function renderFr() {
    // The French catalog is a lazy chunk: load it first so the assertions test
    // the wording, not how fast a dynamic import resolves under load.
    await loadCatalog('fr');
    render(
      <LanguageProvider initialLocale="fr">
        <CreateScreen />
      </LanguageProvider>,
    );
  }

  it('localises built-in categories through the overlay and team ones through nameFr (English fallback)', async () => {
    const user = userEvent.setup();
    await renderFr();
    const group = screen.getByRole('group', { name: 'Choisir une catégorie' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Nutrition au quotidien',
      'Gestion du poids',
      'Diètes vétérinaires',
      'Gastro-intestinal',
    ]);
    await user.click(
      within(screen.getByRole('tablist', { name: 'Animal pour l’entraînement' })).getByRole('tab', {
        name: 'Chat',
      }),
    );
    // URINARY has no French name: English stands in.
    expect(within(group).getByRole('button', { name: 'Urinary' })).toBeInTheDocument();
  });
});
