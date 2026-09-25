/**
 * Scenario Studio — the screen, the home and the editor frame.
 *
 * The data layer is stubbed; every pure helper stays real. The steps built by
 * other tracks and the assistant panel are replaced by stand-ins, so these
 * cases exercise only the shell: the read-error block (carried over from the
 * old builder — the one behaviour that has to hold however the screen is
 * refactored), the home composer, step navigation, what a save sends, the
 * publish gate, and resuming unsaved work.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = {
  overrides: { data: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn() },
  userScenarios: { data: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn() },
  docs: { data: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn() },
};

const { upsertScenarioOverride, deleteScenarioOverride, duplicateScenario } = vi.hoisted(() => ({
  upsertScenarioOverride: vi.fn(async (row: Record<string, unknown>) => ({ ...row })),
  deleteScenarioOverride: vi.fn(async () => ({ ok: true })),
  duplicateScenario: vi.fn(),
}));

vi.mock('../../data/queries', () => ({
  useScenarioOverrides: () => state.overrides,
  useUserScenarios: () => state.userScenarios,
  useKnowledgeDocuments: () => state.docs,
  upsertScenarioOverride,
  deleteScenarioOverride,
  duplicateScenario,
}));

// The assistant panel: shows what the shell handed it.
vi.mock('../copilot/CopilotPanel', () => ({
  CopilotPanel: (props: { pendingPrompt: { text: string } | null; variant: string }) => (
    <div data-testid="copilot" data-variant={props.variant}>
      {props.pendingPrompt ? `pending: ${props.pendingPrompt.text}` : 'no pending prompt'}
    </div>
  ),
}));

// Steps owned by other tracks — stand-ins keep this test about the frame.
vi.mock('../steps/PetStep', () => ({ PetStep: () => <div>pet step body</div> }));
vi.mock('../steps/PushbackStep', () => ({ PushbackStep: () => <div>pushback step body</div> }));
vi.mock('../steps/CustomerStep', () => ({ CustomerStep: () => <div>customer step body</div> }));
vi.mock('../steps/KnowledgeStep', () => ({ KnowledgeStep: () => <div>knowledge step body</div> }));
vi.mock('../steps/BriefStep', () => ({ BriefStep: () => <div>brief step body</div> }));
vi.mock('../steps/TestDriveStep', () => ({ TestDriveStep: () => <div>test drive body</div> }));

// eslint-disable-next-line import/first
import { ScenarioStudioScreen } from '../ScenarioStudioScreen';
// eslint-disable-next-line import/first
import { AccessProvider } from '../../primitives/access';
// eslint-disable-next-line import/first
import { ToastProvider } from '../../primitives/Toast';
// eslint-disable-next-line import/first
import { ConfirmProvider } from '../../primitives/Confirm';
// eslint-disable-next-line import/first
import { LOCAL_DRAFTS_KEY } from '../localDrafts';
// eslint-disable-next-line import/first
import { EMPTY_TRANSCRIPT } from '../copilot/types';

const WRITER = ['scenarios.read', 'scenarios.write', 'knowledge.read'];

function renderScreen(permissions: string[] = WRITER) {
  return render(
    <AccessProvider permissions={permissions}>
      <ToastProvider>
        <ConfirmProvider>
          <ScenarioStudioScreen query="" onQuery={() => {}} />
        </ConfirmProvider>
      </ToastProvider>
    </AccessProvider>,
  );
}

function overrideRow(over: Record<string, unknown>) {
  return {
    scenario_id: 'seed:1',
    visible: false,
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
    focus_area: null,
    knowledge_slugs: null,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    updated_at: '2026-09-20T10:00:00Z',
    ...over,
  };
}

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 2, name });

beforeEach(() => {
  state.overrides = { data: [], loading: false, error: null, refetch: vi.fn() };
  state.userScenarios = { data: [], loading: false, error: null, refetch: vi.fn() };
  state.docs = { data: [], loading: false, error: null, refetch: vi.fn() };
  upsertScenarioOverride.mockClear();
  deleteScenarioOverride.mockClear();
  duplicateScenario.mockClear();
});

// ── Read errors (ported from the old builder) ────────────────

describe('ScenarioStudioScreen read errors', () => {
  it('lists the library scenarios when both reads succeed', () => {
    renderScreen();
    expect(screen.getByText('Weight / obesity denial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Build it with the assistant/ })).toBeInTheDocument();
  });

  it('blocks the Studio when the override read fails', () => {
    state.overrides = { ...state.overrides, error: 'Request failed (500)' };
    renderScreen();
    expect(screen.getByText('Couldn’t load the scenarios')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    // The manifest-only list must not be presented as the truth.
    expect(screen.queryByText('Weight / obesity denial')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Build it with the assistant/ })).not.toBeInTheDocument();
  });

  it('blocks the Studio when the trainee-scenario read fails', () => {
    state.userScenarios = { ...state.userScenarios, error: 'Not signed in' };
    renderScreen();
    expect(screen.getByText('Couldn’t load the scenarios')).toBeInTheDocument();
    expect(screen.queryByText('Weight / obesity denial')).not.toBeInTheDocument();
  });

  it('hides the write controls without scenarios.write, and says so', () => {
    renderScreen(['scenarios.read']);
    expect(screen.queryByRole('button', { name: /Build it with the assistant/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
    expect(screen.getByText(/You can browse every scenario here, but not change them/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^View / }).length).toBeGreaterThan(0);
  });

  it('degrades gracefully for a role that can’t read the knowledge library', async () => {
    state.docs = { ...state.docs, error: 'Forbidden' };
    renderScreen(['scenarios.read', 'scenarios.write']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Weight / obesity denial”' }));
    expect(await heading('Who is the patient?')).toBeInTheDocument();
  });
});

// ── Home ─────────────────────────────────────────────────────

describe('StudioHome composer', () => {
  it('keeps "Build it with the assistant" disabled until something is described', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /Build it with the assistant/ })).toBeDisabled();
  });

  it('opens a new draft with the description queued for the assistant', async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Describe the conversation'), {
      target: { value: 'An owner who thinks her cat is fine without the renal diet' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Cat/ }));
    fireEvent.click(screen.getByRole('button', { name: /Build it with the assistant/ }));

    expect(await heading('Who is the patient?')).toBeInTheDocument();
    const panel = await screen.findByTestId('copilot');
    expect(panel).toHaveTextContent(
      'pending: Species: Cat. An owner who thinks her cat is fine without the renal diet',
    );
  });

  it('fills the composer from a starter idea', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /A busy Lab owner who thinks the weight-loss food/ }));
    expect(screen.getByLabelText('Describe the conversation')).toHaveValue(
      'A busy Lab owner who thinks the weight-loss food is too expensive',
    );
    expect(screen.getByRole('radio', { name: /Dog/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('starts step by step without an assistant message', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start step by step' }));
    expect(await heading('Who is the patient?')).toBeInTheDocument();
    // The drawer isn't opened, so the panel isn't even mounted.
    expect(screen.queryByTestId('copilot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open the assistant/ })).toBeInTheDocument();
  });
});

// ── Editor ───────────────────────────────────────────────────

describe('StudioEditor', () => {
  it('renders step 1, continues to step 2, and jumps from the rail', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Weight / obesity denial”' }));

    expect(await heading('Who is the patient?')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 7 · The pet')).toBeInTheDocument();
    expect(screen.getByText('pet step body')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to the pushback →' }));
    expect(await heading('What is the owner pushing back on?')).toBeInTheDocument();
    expect(screen.getByText('pushback step body')).toBeInTheDocument();

    const rail = screen.getByRole('navigation', { name: 'Scenario steps' });
    const brief = within(rail).getByRole('button', { name: /^Step 5: AI brief/ });
    fireEvent.click(brief);
    expect(await heading('How is the AI customer briefed?')).toBeInTheDocument();
    expect(brief).toHaveAttribute('aria-current', 'step');
  });

  it('saves a library scenario as a sparse override — only what changed', async () => {
    state.overrides = { ...state.overrides, data: [overrideRow({ scenario_id: 'seed:1', visible: false })] };
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Cost / price pushback”' }));
    await heading('Who is the patient?');

    const rail = screen.getByRole('navigation', { name: 'Scenario steps' });
    fireEvent.click(within(rail).getByRole('button', { name: /^Step 7: Publish/ }));
    await heading('How trainees will see it');
    fireEvent.change(screen.getByLabelText('Card title'), { target: { value: 'Big Lab, small budget' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(upsertScenarioOverride).toHaveBeenCalledTimes(1));
    const payload = upsertScenarioOverride.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.scenario_id).toBe('seed:1');
    expect(payload.card_title_override).toBe('Big Lab, small budget');
    expect(payload.visible).toBe(false);
    // Values equal to the shipped scenario are sent as null ("inherit"), so a
    // later update of the built-in keeps flowing through.
    expect(payload.breed).toBeNull();
    expect(payload.pushback_id).toBeNull();
    expect(payload.opening_line_override).toBeNull();
    // Server-managed columns never leave the browser.
    expect(payload).not.toHaveProperty('updated_at');
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('won’t publish a scenario missing its core answers — it opens the checklist instead', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start step by step' }));
    await heading('Who is the patient?');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await heading('How trainees will see it')).toBeInTheDocument();
    const checklist = screen.getByRole('list', { name: 'Readiness checklist' });
    expect(within(checklist).getByText(/Missing: Breed, Life stage, Pushback, ECHO driver/)).toBeInTheDocument();
    expect(upsertScenarioOverride).not.toHaveBeenCalled();
  });

  it('explains, rather than sends, a save the server would refuse', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start step by step' }));
    await heading('Who is the patient?');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText(/To be saved, this scenario still needs its breed, life stage, pushback and ECHO driver/),
    ).toBeInTheDocument();
    expect(upsertScenarioOverride).not.toHaveBeenCalled();
  });

  it('offers unsaved work kept in this browser, and resumes it', async () => {
    const saved = {
      scenario_id: 'seed:0',
      visible: true,
      breed: 'Beagle',
    };
    localStorage.setItem(
      LOCAL_DRAFTS_KEY,
      JSON.stringify({
        'seed:0': {
          draft: saved,
          baseline: JSON.stringify({ scenario_id: 'seed:0', visible: true, breed: 'Lab' }),
          step: 'pushback',
          transcript: EMPTY_TRANSCRIPT,
          tested: false,
          title: 'Weight / obesity denial',
          savedAt: Date.now() - 2 * 60 * 60 * 1000,
        },
      }),
    );
    renderScreen();

    // The home lists it under "Pick up where you left off".
    expect(screen.getByText('Pick up where you left off')).toBeInTheDocument();

    // Opening it from the gallery asks before applying it.
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Weight / obesity denial”' }));
    await heading('Who is the patient?');
    expect(screen.getByText('You have unsaved changes from 2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    // Nothing can be edited or saved until the admin answers.
    expect(screen.getByRole('button', { name: 'Update live scenario' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await heading('What is the owner pushing back on?')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update live scenario' })).toBeEnabled();
    expect(screen.queryByText(/You have unsaved changes from/)).not.toBeInTheDocument();
  });

  it('keeps a never-saved draft in this browser across Resume and leaving again', async () => {
    localStorage.setItem(
      LOCAL_DRAFTS_KEY,
      JSON.stringify({
        'admin:kept': {
          draft: { scenario_id: 'admin:kept', visible: false, breed: 'Persian', species: 'cat', difficulty_override: 2 },
          baseline: '{}',
          step: 'pet',
          transcript: EMPTY_TRANSCRIPT,
          tested: false,
          title: 'Persian draft',
          savedAt: Date.now() - 60_000,
        },
      }),
    );
    renderScreen();
    expect(screen.getByText(/Never saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume “Persian draft”' }));
    await heading('Who is the patient?');
    expect(screen.getByText('Not saved yet — kept in this browser')).toBeInTheDocument();

    // Past the write debounce: the entry must still be there.
    await new Promise((r) => setTimeout(r, 600));
    expect(JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) ?? '{}')).toHaveProperty('admin:kept');

    fireEvent.click(screen.getByRole('button', { name: 'Back to the Studio' }));
    // Re-titled from the draft itself; the pet line tells untitled drafts apart.
    expect(await screen.findByRole('button', { name: 'Resume “Untitled scenario”' })).toBeInTheDocument();
    expect(screen.getByText(/Persian · Never saved/)).toBeInTheDocument();
  });

  it('forgets a blank new scenario nobody touched', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start step by step' }));
    await heading('Who is the patient?');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Studio' }));
    await screen.findByRole('button', { name: /Build it with the assistant/ });
    expect(screen.queryByText('Pick up where you left off')).not.toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_DRAFTS_KEY)).toBeNull();
  });

  it('warns that edits to a trainee-built scenario don’t reach the trainee', async () => {
    state.userScenarios = {
      ...state.userScenarios,
      data: [
        {
          id: 'u1',
          creator_id: 'c1',
          title: 'My tricky client',
          breed: 'Beagle',
          life_stage: 'Senior (7+)',
          difficulty: 3,
          pushback_id: 'cost',
          pushback_notes: null,
          weight_kg: null,
          persona: 'Busy',
          suggested_driver: 'Energizer',
          context: null,
          opening_line: null,
          scenario_summary: null,
          is_public: false,
          plays: 0,
          avg_score: null,
          created_at: '2026-09-01T10:00:00Z',
        },
      ],
    };
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Edit “My tricky client”' }));
    await heading('Who is the patient?');
    expect(screen.getByText('Edits here don’t reach the trainee who built this')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });
});
