import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioLibraryScreen } from '../ScenarioLibraryScreen';
import type { Scenario } from '../../data/scenarios';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';
import type { TeamObjection } from '../../shared/scenarios/objections';
import type { ObjectionCategory } from '../../shared/scenarios/objectionCategories';
import { LanguageProvider } from '../../app/providers/LanguageProvider';
import { loadCatalog } from '../../i18n/translate';

const { go, back, setScenario, logEvent } = vi.hoisted(() => ({
  go: vi.fn(),
  back: vi.fn(),
  setScenario: vi.fn(),
  logEvent: vi.fn(),
}));

let flagSnapshot: FlagSnapshot | null = null;
let flagValues: Record<string, unknown> = {};

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go, back, replace: vi.fn(), current: 'scenarioLibrary', history: ['home'] }),
}));
vi.mock('../../app/providers/ScenarioProvider', () => ({
  useScenario: () => ({ scenario: null, setScenario }),
}));
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
/** Team category with an icon chosen in the Studio and a French name. */
const GI: ObjectionCategory = { ...CATEGORY, id: 'category:gi', name: 'GI', nameFr: 'Gastro-intestinal', sortOrder: 40, icon: 'sprout' };
/** No icon chosen: the name suggests one (droplet). */
const URINARY: ObjectionCategory = { ...CATEGORY, id: 'category:urinary', name: 'Urinary health', sortOrder: 50 };
const PROBIOTICS: TeamObjection = {
  ...OBJECTION,
  id: 'team:probiotics',
  title: "Probiotics: 'he doesn't need them'",
  species: ['dog'],
  categoryId: 'category:gi',
};
const WET_FOOD: TeamObjection = {
  ...OBJECTION,
  id: 'team:wet-food',
  title: 'Wet food is a waste',
  species: ['cat'],
  categoryId: 'category:urinary',
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
const ADMIN_DOG_COST: ScenarioOverride = {
  ...ROW,
  scenario_id: 'admin:dog-cost',
  breed: 'Poodle',
  life_stage: 'Senior (7+)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
  card_title_override: 'Budget-minded owner',
};
const ADMIN_DOG_OTHER: ScenarioOverride = {
  ...ROW,
  scenario_id: 'admin:dog-other',
  breed: 'Boxer',
  life_stage: 'Adult (3-7)',
  pushback_id: 'custom',
  pushback_notes: 'Insists on a home-cooked diet.',
  suggested_driver: 'Activator',
  card_title_override: 'Home cooking',
};
/** The admin hid the cost seed (seed:1). */
const HIDDEN_SEED: ScenarioOverride = { ...ROW, scenario_id: 'seed:1', visible: false };

function snapshot(overrides: ScenarioOverride[]): FlagSnapshot {
  return {
    flags: {},
    scenarioOverrides: overrides,
    objections: [PROBIOTICS, WET_FOOD],
    objectionCategories: [GI, URINARY],
    fetchedAt: 0,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const animalSwitch = () => screen.queryByRole('tablist', { name: 'Animal to train on' });
const groupList = () => screen.queryByRole('list', { name: 'Focus areas' });
const groupCards = () =>
  within(groupList()!)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));
const startButtons = () =>
  screen
    .queryAllByRole('button', { name: /^Start: / })
    .map((b) => b.getAttribute('aria-label')!.replace(/^Start: /, ''));
const topBack = () => screen.getByRole('button', { name: 'Back' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  flagSnapshot = snapshot([HIDDEN_SEED, ADMIN_CAT, ADMIN_DOG_PROBIOTICS, ADMIN_DOG_COST, ADMIN_DOG_OTHER]);
  flagValues = { 'scenario.cat.enabled': true };
  window.history.replaceState(null, '');
});

// ── The animal pill ───────────────────────────────────────────────────────

describe('ScenarioLibraryScreen — Dog | Cat', () => {
  it('shows the pill when cats are on and the library holds both animals', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    const pill = animalSwitch()!;
    expect(within(pill).getByRole('tab', { name: 'Dog' })).toHaveAttribute('aria-selected', 'true');
    // Pet icons, never emoji.
    for (const name of ['Dog', 'Cat']) {
      const tab = within(pill).getByRole('tab', { name });
      expect(tab.querySelector('svg')).not.toBeNull();
      expect(tab).toHaveTextContent(new RegExp(`^${name}$`));
    }
    await user.click(within(pill).getByRole('tab', { name: 'Cat' }));
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');
    // One cat area: its scenarios open straight away.
    expect(groupList()).toBeNull();
    expect(startButtons()).toEqual(['Kitten on dry food']);
  });

  it('has no pill while scenario.cat.enabled is off, and lists no cat scenario', async () => {
    flagValues = {};
    localStorage.setItem('pbt:train_species', '"cat"');
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    expect(animalSwitch()).toBeNull();
    await user.click(screen.getByRole('button', { name: /^All scenarios/ }));
    expect(startButtons()).not.toContain('Kitten on dry food');
    expect(startButtons()).toContain('Weight / obesity denial');
  });

  it('has no pill when the library only holds dogs — and a stored cat choice never empties it', () => {
    flagSnapshot = snapshot([HIDDEN_SEED, ADMIN_DOG_PROBIOTICS]);
    localStorage.setItem('pbt:train_species', '"cat"');
    render(<ScenarioLibraryScreen />);
    expect(animalSwitch()).toBeNull();
    expect(groupList()).not.toBeNull();
  });
});

// ── Step 1 → step 2 → back ────────────────────────────────────────────────

describe('ScenarioLibraryScreen — focus areas → scenarios', () => {
  it('lists only the areas holding a scenario for the animal, in category order, with counts and "Other" last', () => {
    render(<ScenarioLibraryScreen />);
    expect(screen.getByRole('heading', { name: 'Choose a focus area' })).toBeInTheDocument();
    expect(groupCards()).toEqual([
      'All scenarios, 5 scenarios',
      'Everyday nutrition, 2 scenarios',
      'Weight management, 1 scenario',
      'GI, 1 scenario',
      'Other pushback, 1 scenario',
    ]);
  });

  it('draws a line icon on every area: fixed for built-ins, the admin’s choice, else the name’s guess', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    const icon = (name: RegExp) =>
      within(groupList()!).getByRole('button', { name }).querySelector('[data-category-icon]')?.getAttribute('data-category-icon');
    expect(icon(/^Everyday nutrition/)).toBe('bowl');
    expect(icon(/^Weight management/)).toBe('scale');
    expect(icon(/^GI/)).toBe('sprout');
    expect(icon(/^Other pushback/)).toBe('message');
    // No emoji anywhere on the grid.
    expect(groupList()!.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    // The cat area (no icon chosen) is guessed from its name.
    await user.click(within(animalSwitch()!).getByRole('tab', { name: 'Cat' }));
    expect(screen.getByRole('heading', { name: 'Urinary health' }).parentElement?.parentElement?.querySelector('[data-category-icon]')?.getAttribute('data-category-icon')).toBe('droplet');
  });

  it('opens an area, narrows it by objection, and the TopBar back returns to the areas', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    await user.click(screen.getByRole('button', { name: /^Everyday nutrition/ }));
    expect(screen.getByRole('heading', { name: 'Everyday nutrition' })).toBeInTheDocument();
    expect(startButtons()).toEqual(['Switching brands hesitation', 'Budget-minded owner']);
    // Inside one area its name isn't repeated on every card.
    const card = screen.getByRole('button', { name: 'Start: Budget-minded owner' });
    expect(within(card).queryByText('Everyday nutrition')).toBeNull();
    expect(within(card).getByText('Cost / price pushback')).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Filter by objection' });
    await user.click(within(chips).getByRole('button', { name: 'Cost / price pushback' }));
    expect(startButtons()).toEqual(['Budget-minded owner']);

    await user.click(topBack());
    expect(back).not.toHaveBeenCalled();
    expect(groupList()).not.toBeNull();
    // From the areas, Back leaves the screen.
    await user.click(topBack());
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('the browser / Android back returns to the areas instead of leaving', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    await user.click(screen.getByRole('button', { name: /^GI/ }));
    expect(startButtons()).toEqual([PROBIOTICS.title]);
    expect(window.history.state?.pbtStep).toBe(true);
    act(() => {
      window.history.replaceState(null, '');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(groupList()).not.toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it('"All scenarios" names each card’s area', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    await user.click(screen.getByRole('button', { name: /^All scenarios/ }));
    expect(startButtons()).toHaveLength(5);
    const card = screen.getByRole('button', { name: 'Start: Weight / obesity denial' });
    expect(within(card).getByText('Weight management')).toBeInTheDocument();
    // No objection chips across every area.
    expect(screen.queryByRole('group', { name: 'Filter by objection' })).toBeNull();
  });

  it('starts a scenario with its override handle and logs it', async () => {
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    await user.click(screen.getByRole('button', { name: /^GI/ }));
    await user.click(screen.getByRole('button', { name: `Start: ${PROBIOTICS.title}` }));
    const started = setScenario.mock.calls[0][0] as Scenario;
    expect(started._overrideId).toBe('admin:dog-1');
    expect(started.pushback.id).toBe('team:probiotics');
    expect(go).toHaveBeenCalledWith('chat');
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'library_scenario', screen: 'scenarioLibrary' }),
    );
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ target: 'library_category' }));
  });

  it('a one-area library skips the area step', () => {
    // Dogs: only brand-switch + cost, both Everyday nutrition.
    flagSnapshot = snapshot([HIDDEN_SEED, { ...ROW, scenario_id: 'seed:0', visible: false }, ADMIN_DOG_COST]);
    flagValues = {};
    render(<ScenarioLibraryScreen />);
    expect(groupList()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Everyday nutrition' })).toBeInTheDocument();
    expect(startButtons()).toEqual(['Switching brands hesitation', 'Budget-minded owner']);
    expect(screen.getByRole('group', { name: 'Filter by objection' })).toBeInTheDocument();
  });

  it('makes the whole card the Start target, difficulty a labelled meter, the persona the owner', async () => {
    flagSnapshot = null;
    flagValues = {};
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    await user.click(screen.getByRole('button', { name: /^Weight management/ }));
    const card = screen.getByRole('button', { name: 'Start: Weight / obesity denial' });
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).getByText('Skeptical owner')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Difficulty: Hostile, level 3 of 4' })).toBeInTheDocument();
  });
});

// ── Empty state ───────────────────────────────────────────────────────────

describe('ScenarioLibraryScreen — nothing published', () => {
  const ALL_HIDDEN = [0, 1, 2].map((i) => ({ ...ROW, scenario_id: `seed:${i}`, visible: false }));

  it('says so honestly and offers Build your own', async () => {
    flagSnapshot = snapshot(ALL_HIDDEN);
    flagValues = {};
    const user = userEvent.setup();
    render(<ScenarioLibraryScreen />);
    expect(screen.getByRole('heading', { name: 'No ready-made scenarios yet' })).toBeInTheDocument();
    expect(startButtons()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Build your own' }));
    expect(go).toHaveBeenCalledWith('create');
  });

  it('offers no way into a switched-off builder', () => {
    flagSnapshot = snapshot(ALL_HIDDEN);
    flagValues = { 'screen.create.enabled': false };
    render(<ScenarioLibraryScreen />);
    expect(screen.getByText(/Check back soon/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Build your own' })).toBeNull();
  });
});

// ── French ────────────────────────────────────────────────────────────────

describe('ScenarioLibraryScreen — French', () => {
  it('names the screen, the areas and the team area in French', async () => {
    await loadCatalog('fr');
    render(
      <LanguageProvider initialLocale="fr">
        <ScenarioLibraryScreen />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Choisissez un thème' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Thèmes' });
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Tous les scénarios, 5 scénarios',
      'Nutrition au quotidien, 2 scénarios',
      'Gestion du poids, 1 scénario',
      'Gastro-intestinal, 1 scénario',
      'Autre objection, 1 scénario',
    ]);
  });
});
