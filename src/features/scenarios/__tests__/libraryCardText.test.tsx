import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { libraryCardPetLine, libraryCardTitles } from '../libraryCardText';
import { LibraryScenarioCardBody } from '../LibraryScenarioCardBody';

describe('libraryCardTitles', () => {
  it('uses the objection as the title when there is no custom title', () => {
    expect(libraryCardTitles(null, 'Cost / price pushback')).toEqual({
      title: 'Cost / price pushback',
      objection: null,
    });
    expect(libraryCardTitles('   ', 'Cost / price pushback').objection).toBeNull();
  });

  it('shows the objection above a custom title that hides it', () => {
    expect(libraryCardTitles(' The price talk ', 'Cost / price pushback')).toEqual({
      title: 'The price talk',
      objection: 'Cost / price pushback',
    });
  });

  it('never repeats the objection when the custom title is the same words', () => {
    expect(libraryCardTitles('Cost / price pushback', 'Cost / price pushback').objection).toBeNull();
  });
});

describe('libraryCardPetLine', () => {
  it('joins breed and life stage with a middle dot', () => {
    expect(libraryCardPetLine('Beagle', 'Adult (3-7)')).toBe('Beagle · Adult (3-7)');
  });
});

describe('LibraryScenarioCardBody', () => {
  it('renders without any provider (the admin preview mounts it bare)', () => {
    render(
      <LibraryScenarioCardBody
        title="The price talk"
        objection="Cost / price pushback"
        species="cat"
        pet="Persian · Kitten (<1)"
        owner="Anxious owner"
        difficulty={3}
        difficultyLabel="Hostile"
        difficultyAria="Difficulty: Hostile, level 3 of 4"
      />,
    );
    expect(screen.getByText('The price talk')).toBeInTheDocument();
    expect(screen.getByText('Cost / price pushback')).toBeInTheDocument();
    expect(screen.getByText('Persian · Kitten (<1)')).toBeInTheDocument();
    expect(screen.getByText('Anxious owner')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Difficulty: Hostile, level 3 of 4' })).toBeInTheDocument();
  });

  it('shows the start arrow by default and drops it where nothing starts (admin preview)', () => {
    const props = {
      title: 'The price talk',
      species: 'dog' as const,
      pet: 'Beagle · Adult (3-7)',
      owner: 'Anxious owner',
      difficulty: 2 as const,
      difficultyLabel: 'Skeptical',
      difficultyAria: 'Difficulty: Skeptical, level 2 of 4',
    };
    const { container, rerender } = render(<LibraryScenarioCardBody {...props} />);
    const arrows = () => container.querySelectorAll('span[aria-hidden] > svg').length;
    const withArrow = arrows();
    rerender(<LibraryScenarioCardBody {...props} showArrow={false} />);
    expect(arrows()).toBe(withArrow - 1);
  });
});
