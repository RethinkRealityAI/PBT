import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardPreview, libraryCardPreview } from '../CardPreview';
import type { StudioDraft } from '../studioModel';

const draft: StudioDraft = {
  scenario_id: 'admin:x',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
};

describe('libraryCardPreview', () => {
  it('says what the Training library card says', () => {
    expect(libraryCardPreview(draft)).toMatchObject({
      title: 'Cost / price pushback',
      objection: null,
      species: 'dog',
      pet: 'Labrador Retriever · Adult (3-7)',
      // The app's fallbacks for a blank persona / difficulty (draftToScenario).
      owner: 'Skeptical owner',
      difficulty: 2,
      difficultyLabel: 'Skeptical',
      difficultyAria: 'Difficulty: Skeptical, level 2 of 4',
      focusArea: { name: 'Everyday nutrition' },
    });
  });

  it('puts the objection above a custom title, and names a kitten', () => {
    const card = libraryCardPreview({
      ...draft,
      species: 'cat',
      breed: 'Persian',
      life_stage: 'Puppy (<1)',
      card_title_override: 'The price talk',
      persona_override: 'Anxious',
      difficulty_override: 4,
    });
    expect(card).toMatchObject({
      title: 'The price talk',
      objection: 'Cost / price pushback',
      species: 'cat',
      pet: 'Persian · Kitten (<1)',
      owner: 'Anxious owner',
      difficultyLabel: 'Combative',
    });
  });

  it('files "Something else" under Other pushback and survives an empty draft', () => {
    expect(libraryCardPreview({ ...draft, pushback_id: 'custom' }).focusArea.name).toBe('Other pushback');
    const empty = libraryCardPreview({ scenario_id: 'admin:y' }, { fallbackTitle: 'Draft' });
    expect(empty).toMatchObject({ title: 'Draft', pet: '— · —' });
  });

  it('names a team objection by its title, in its own category', () => {
    const card = libraryCardPreview(
      { ...draft, pushback_id: 'team:probiotic-doubt' },
      {
        objections: [{ id: 'team:probiotic-doubt', title: 'Probiotics are a fad', categoryId: 'category:gi' }],
        categories: [{ id: 'category:gi', name: 'Gut health' }],
      },
    );
    expect(card.title).toBe('Probiotics are a fad');
    expect(card.focusArea.name).toBe('Gut health');
  });
});

describe('CardPreview', () => {
  it('renders the trainee card and its focus area (no start button, no info panel)', () => {
    render(<CardPreview draft={{ ...draft, start_button_label: 'Go now', info_modal_body: 'Secret text' }} />);
    expect(screen.getByRole('group', { name: 'Preview of the card trainees will see' })).toBeInTheDocument();
    expect(screen.getByText('Cost / price pushback')).toBeInTheDocument();
    expect(screen.getByText('Everyday nutrition')).toBeInTheDocument();
    expect(screen.queryByText(/Go now/)).toBeNull();
    expect(screen.queryByText(/Secret text/)).toBeNull();
  });
});
