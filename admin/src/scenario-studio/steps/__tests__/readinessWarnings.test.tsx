/**
 * Readiness warnings, rendered: the Publish step lists them as RECOMMENDED
 * rows (never blocking — Publish stays available), and the Pushback step
 * offers the fix for a team objection with no hidden concerns (the objection
 * editor opened on Coaching, the hidden-concerns box focused).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PublishStep } from '../PublishStep';
import { PushbackStep } from '../PushbackStep';
import { buildStudioContext, type StudioDraft } from '../../studioModel';
import type { StepProps } from '../../types';
import { NO_OBJECTIONS, ObjectionsProvider } from '../../objections/ObjectionsContext';
import type { ObjectionsApi } from '../../objections/useObjections';
import { toAdminObjection } from '../../objections/objectionsModel';
import { builtInAdminCategories, toAdminCategory } from '../../objections/categoriesModel';
import type { AdminObjection } from '../../../../../src/shared/scenarios/objections';
import type { AdminObjectionCategory } from '../../../../../src/shared/scenarios/objectionCategories';
import { completeDraft, renderStep } from './harness';

function objection(over: Record<string, unknown>): AdminObjection {
  const o = toAdminObjection({
    id: 'team:probiotics-not-needed',
    title: 'Probiotics: not needed',
    example: '“Why would he need them?”',
    species: ['dog', 'cat'],
    categoryId: 'category:probiotics',
    coaching: {},
    visible: true,
    updatedAt: '2026-10-10T10:00:00Z',
    usage: { scenarios: 1, live: 0, trainee: 0 },
    ...over,
  });
  if (!o) throw new Error('bad fixture');
  return o;
}

const GENERIC = objection({});
const PROBIOTICS = toAdminCategory({
  id: 'category:probiotics',
  name: 'Probiotics',
  description: 'Owners who doubt a daily probiotic.',
  focusArea: 'gi',
  knowledgeSlugs: ['study:dog-scoring'],
  sortOrder: 40,
  updatedAt: '2026-10-10T00:00:00Z',
}) as AdminObjectionCategory;

const DOCS = [
  {
    slug: 'study:dog-scoring',
    title: 'Dog probiotic trial',
    chunk_count: 4,
    metadata: { tags: { tools: ['roleplay', 'scoring'], species: ['dog', 'puppy'] } },
  },
];

function api(): ObjectionsApi {
  return {
    ...NO_OBJECTIONS,
    status: 'ready',
    loaded: true,
    available: true,
    loadedAt: 1,
    objections: [GENERIC],
    categories: [...builtInAdminCategories(), PROBIOTICS],
  };
}

const catDraft: StudioDraft = completeDraft({ species: 'cat', breed: 'Persian', pushback_id: GENERIC.id });

describe('Publish step — readiness warnings', () => {
  it('lists both warnings as recommended rows and still lets the admin publish', () => {
    const onPublish = vi.fn();
    const ctx = buildStudioContext({
      draft: catDraft,
      source: 'admin',
      tested: true,
      docs: DOCS,
      objections: { team: [GENERIC], loaded: true },
      categories: api().categories,
    });
    function Publish(props: StepProps) {
      return (
        <PublishStep
          {...props}
          live={false}
          savedOnce
          dirty={false}
          busy={null}
          speciesPending={false}
          onPublish={onPublish}
          onSaveDraft={vi.fn()}
          onUnpublish={vi.fn()}
          onDuplicate={vi.fn()}
        />
      );
    }
    const { props } = renderStep(Publish, { draft: catDraft, ctx });

    const checklist = screen.getByRole('list', { name: 'Readiness checklist' });
    const concerns = within(checklist).getByText('The objection says what the owner is really worried about').closest('li')!;
    expect(within(concerns).getByText('Recommended')).toBeInTheDocument();
    expect(within(concerns).getByText(/“Probiotics: not needed” has no hidden concerns/)).toBeInTheDocument();

    const scoring = within(checklist).getByText('The scorecard can draw on the Probiotics documents').closest('li')!;
    expect(within(scoring).getByText('Recommended')).toBeInTheDocument();
    expect(
      within(scoring).getByText(
        'None of the Probiotics documents are filed for scoring for cats, so the scorecard won’t cite them. In Knowledge, add “Session scoring” and cats to at least one of them.',
      ),
    ).toBeInTheDocument();

    // Advice, not a gate.
    expect(screen.getByText('Everything required is in place.')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publish to trainees' });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledTimes(1);

    // Each row jumps to the step that fixes it.
    fireEvent.click(within(concerns).getByRole('button', { name: 'Fix it on The pushback' }));
    expect(props.goTo).toHaveBeenLastCalledWith('pushback');
    fireEvent.click(within(scoring).getByRole('button', { name: 'Fix it on Knowledge' }));
    expect(props.goTo).toHaveBeenLastCalledWith('knowledge');
  });
});

describe('Pushback step — an objection with no hidden concerns', () => {
  function Wrapped(props: StepProps) {
    return (
      <ObjectionsProvider value={api()}>
        <PushbackStep {...props} />
      </ObjectionsProvider>
    );
  }

  it('says so, and “Add hidden concerns” opens the objection on its Coaching', async () => {
    renderStep(Wrapped, { draft: catDraft });
    expect(screen.getByText('“Probiotics: not needed” has no hidden concerns')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add hidden concerns' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit objection' });
    expect(within(dialog).getByRole('button', { name: /^Coaching/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('No hidden concerns yet')).toBeInTheDocument();
    const box = within(dialog).getByLabelText(/What the owner is really worried about/);
    await waitFor(() => expect(box).toHaveFocus());

    // Writing one clears the hint.
    fireEvent.change(box, { target: { value: 'Thinks it is an upsell' } });
    expect(within(dialog).queryByText('No hidden concerns yet')).not.toBeInTheDocument();
  });

  it('says nothing for a coached team objection or a built-in', () => {
    const coached = objection({ coaching: { rootConcerns: ['Thinks it is an upsell'] } });
    function WithCoached(props: StepProps) {
      return (
        <ObjectionsProvider value={{ ...api(), objections: [coached] }}>
          <PushbackStep {...props} />
        </ObjectionsProvider>
      );
    }
    const { unmount } = renderStep(WithCoached, { draft: catDraft });
    expect(screen.queryByText(/has no hidden concerns/)).not.toBeInTheDocument();
    unmount();
    renderStep(Wrapped, { draft: completeDraft({ pushback_id: 'cost' }) });
    expect(screen.queryByText(/has no hidden concerns/)).not.toBeInTheDocument();
  });
});
