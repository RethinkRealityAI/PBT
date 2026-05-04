import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreRing } from '../ScoreRing';
import { ScoreChip } from '../ScoreChip';

describe('<ScoreRing>', () => {
  it('clamps and renders the score', () => {
    render(<ScoreRing score={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /score 100 out of 100/i })).toBeInTheDocument();
  });

  it('renders an optional label', () => {
    render(<ScoreRing score={88} label="Overall" />);
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });
});

describe('<ScoreChip>', () => {
  it('clamps negative to 0', () => {
    render(<ScoreChip score={-10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
