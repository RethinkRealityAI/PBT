import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreateScreen } from '../CreateScreen';
import type { Scenario } from '../../data/scenarios';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';
import type { TeamObjection } from '../../shared/scenarios/objections';
import { POPULAR_BREEDS } from '../../shared/scenarios/species';

const { go, back, setScenario, persistUserScenario, logEvent } = vi.hoisted(() => ({
  go: vi.fn(),
  back: vi.fn(),
  setScenario: vi.fn(),
  persistUserScenario: vi.fn(),
  logEvent: vi.fn(),
}));

/** The flag snapshot the screen sees (team objections + scenario overrides). */
let flagSnapshot: FlagSnapshot | null = null;

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
      getFlag: <T,>(_key: string, fallback: T) => fallback,
      getOverride: (id: string) => findOverride(flagSnapshot, id),
      getSimulationConfig: () => null,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const OBJECTION: Omit<TeamObjection, 'id' | 'title' | 'species'> = {
  example: '"A line."',
  titleFr: null,
  exampleFr: null,
  focusArea: null,
  coaching: {},
  visible: true,
  sortOrder: null,
  updatedAt: null,
};
const PROBIOTICS: TeamObjection = {
  ...OBJECTION,
  id: 'team:probiotics',
  title: "Probiotics: 'he doesn't need them'",
  example: '"He eats fine — why a probiotic?"',
  species: ['dog'],
  focusArea: 'gi',
  sortOrder: 1,
};
const WET_FOOD: TeamObjection = {
  ...OBJECTION,
  id: 'team:wet-food',
  title: 'Wet food is a waste',
  example: '"She does fine on kibble."',
  species: ['cat'],
  focusArea: 'urinary',
  sortOrder: 2,
};
const RETIRED: TeamObjection = {
  ...OBJECTION,
  id: 'team:retired',
  title: 'Retired topic',
  species: ['dog', 'cat'],
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

function snapshot(overrides: ScenarioOverride[], objections: TeamObjection[] = [PROBIOTICS, WET_FOOD, RETIRED]): FlagSnapshot {
  return { flags: {}, scenarioOverrides: overrides, objections, fetchedAt: 0 };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const animalTab = (name: 'Dog' | 'Cat') =>
  within(screen.getByRole('tablist', { name: 'Animal to train on' })).getByRole('tab', { name });
const screenTab = (name: 'Build' | 'Library') =>
  within(screen.getByRole('tablist', { name: 'Scenario tabs' })).getByRole('tab', { name });
const breedInput = () => screen.getByRole('textbox', { name: 'Breed' }) as HTMLInputElement;
const chip = (name: string) => screen.queryByRole('button', { name });

async function openObjectionDropdown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Select pushback type' }));
}

/** Is an objection offered in the open dropdown? (Its option's name = title + example.) */
const offered = (title: string) =>
  screen.queryAllByRole('button').some((b) => (b.textContent ?? '').startsWith(title));

beforeEach(() => {
  vi.clearAllMocks();
  flagSnapshot = snapshot([HIDDEN_SEED, ADMIN_CAT, ADMIN_DOG_PROBIOTICS]);
});

// ── Build tab ─────────────────────────────────────────────────────────────

describe('CreateScreen — which animal (Build tab)', () => {
  it('opens on Build with Dog chosen and dog breed suggestions', () => {
    render(<CreateScreen />);
    expect(screenTab('Build')).toHaveAttribute('aria-selected', 'true');
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

  it('offers a team objection only for the animals it applies to (never a retired one)', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await openObjectionDropdown(user);
    expect(offered(PROBIOTICS.title)).toBe(true);
    expect(offered('Cost / price pushback')).toBe(true);
    expect(offered(WET_FOOD.title)).toBe(false);
    expect(offered(RETIRED.title)).toBe(false);

    await user.click(animalTab('Cat'));
    await openObjectionDropdown(user);
    expect(await screen.findByRole('button', { name: new RegExp(WET_FOOD.title) })).toBeInTheDocument();
    expect(offered(PROBIOTICS.title)).toBe(false);
    expect(offered(RETIRED.title)).toBe(false);
  });

  it('resets an objection that does not apply to the new animal', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await openObjectionDropdown(user);
    await user.click(screen.getByRole('button', { name: new RegExp(PROBIOTICS.title.slice(0, 10)) }));
    const trigger = screen.getByRole('button', { name: 'Select pushback type' });
    expect(trigger).toHaveTextContent(PROBIOTICS.title);
    await user.click(animalTab('Cat'));
    expect(trigger).toHaveTextContent('Cost / price pushback');
  });

  it('builds a cat scenario carrying species, the team objection and its knowledge topic', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(animalTab('Cat'));
    await openObjectionDropdown(user);
    await user.click(screen.getByRole('button', { name: new RegExp(WET_FOOD.title) }));
    await user.click(screen.getAllByRole('button', { name: 'Start scenario' })[0]);

    expect(setScenario).toHaveBeenCalledTimes(1);
    const built = setScenario.mock.calls[0][0] as Scenario;
    expect(built.species).toBe('cat');
    expect(built.breed).toBe(POPULAR_BREEDS.cat[0]);
    expect(built.focusArea).toBe('urinary');
    expect(built.pushback).toEqual({
      id: 'team:wet-food',
      title: WET_FOOD.title,
      example: WET_FOOD.example,
    });
    expect(persistUserScenario).toHaveBeenCalledWith(built);
    expect(go).toHaveBeenCalledWith('chat');
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

// ── Library tab ───────────────────────────────────────────────────────────

describe('CreateScreen — Library tab', () => {
  const startButtons = () =>
    screen
      .queryAllByRole('button', { name: /^Start: / })
      .map((b) => b.getAttribute('aria-label')!.replace(/^Start: /, ''));

  it('lists the RESOLVED library for the chosen animal: hidden seed gone, published scenarios in', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(screenTab('Library'));
    const dogCards = startButtons();
    expect(dogCards).toContain('Weight / obesity denial');
    expect(dogCards).toContain('Switching brands hesitation');
    expect(dogCards).toContain(PROBIOTICS.title);
    // seed:1 (cost) is admin-hidden; the cat scenario is not a dog's.
    expect(dogCards).not.toContain('Cost / price pushback');
    expect(dogCards).not.toContain('Kitten on dry food');

    await user.click(animalTab('Cat'));
    expect(startButtons()).toEqual(['Kitten on dry food']);
    expect(screen.getByText('Maine Coon · Kitten (<1) · Skeptical')).toBeInTheDocument();
  });

  it('names the objection on a card whose title the admin customised', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(animalTab('Cat'));
    await user.click(screenTab('Library'));
    // The custom title says nothing about the pushback; the eyebrow does.
    expect(screen.getByText(WET_FOOD.title)).toBeInTheDocument();
    // A card titled by its objection doesn't repeat it (the filter chip of
    // the same name sits outside the card).
    await user.click(animalTab('Dog'));
    const card = screen.getByRole('button', { name: 'Start: Weight / obesity denial' }).parentElement!;
    expect(within(card).getAllByText('Weight / obesity denial')).toHaveLength(1);
  });

  it('starts a library scenario with its override handle', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(animalTab('Cat'));
    await user.click(screenTab('Library'));
    await user.click(screen.getByRole('button', { name: 'Start: Kitten on dry food' }));
    const started = setScenario.mock.calls[0][0] as Scenario;
    expect(started._overrideId).toBe('admin:cat-1');
    expect(started.species).toBe('cat');
    expect(started.pushback.id).toBe('team:wet-food');
    expect(go).toHaveBeenCalledWith('chat');
  });

  it('filters by objection with chips', async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(screenTab('Library'));
    const filters = screen.getByRole('group', { name: 'Filter by objection' });
    const chips = within(filters).getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual([
      'All',
      'Switching brands hesitation',
      'Weight / obesity denial',
      PROBIOTICS.title,
    ]);
    expect(within(filters).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: PROBIOTICS.title }));
    expect(startButtons()).toEqual([PROBIOTICS.title]);
    expect(within(filters).getByRole('button', { name: PROBIOTICS.title })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(filters).getByRole('button', { name: 'All' }));
    expect(startButtons()).toHaveLength(3);
  });

  it('shows an empty state with a way to build one when the animal has no library scenarios', async () => {
    const user = userEvent.setup();
    flagSnapshot = snapshot([HIDDEN_SEED]);
    render(<CreateScreen />);
    await user.click(screenTab('Library'));
    await user.click(animalTab('Cat'));
    expect(screen.getByText('No cat scenarios in the library yet.')).toBeInTheDocument();
    expect(startButtons()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Build one' }));
    expect(screenTab('Build')).toHaveAttribute('aria-selected', 'true');
    expect(breedInput().value).toBe(POPULAR_BREEDS.cat[0]);
  });

  it('without a snapshot the Library is the three shipped dog scenarios', async () => {
    const user = userEvent.setup();
    flagSnapshot = null;
    render(<CreateScreen />);
    await user.click(screenTab('Library'));
    expect(startButtons()).toEqual([
      'Weight / obesity denial',
      'Cost / price pushback',
      'Switching brands hesitation',
    ]);
  });
});
