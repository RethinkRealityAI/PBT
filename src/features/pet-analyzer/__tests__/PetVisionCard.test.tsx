import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PetVisionCard, type VisionOverrides } from '../PetVisionCard';
import type { PetVisionResult } from '../../../services/petVisionService';
import type { UsePetVision } from '../usePetVision';

const RESULT: PetVisionResult = {
  isDog: true,
  breed: 'Labrador Retriever',
  breedConfidence: 0.92,
  alternativeBreeds: ['Golden Retriever'],
  lifeStage: 'adult',
  ageEstimate: 'Adult, roughly 4–6 years',
  bcs: 6,
  bcsRationale: 'Waist visible but ribs carry light cover.',
  dermatitis: {
    severity: 'mild',
    indicators: ['patchy redness at the left flank'],
    note: '',
  },
  guidance: 'Discuss a gradual weight plan.',
  notVisible: ['dental condition'],
};

const doneVision = (): UsePetVision =>
  ({
    status: 'done',
    result: RESULT,
    previewUrl: null,
    error: null,
    analyzeFile: vi.fn(),
    reset: vi.fn(),
  }) as unknown as UsePetVision;

describe('PetVisionCard — adjust-before-saving row', () => {
  it('renders editable age + severity when override handlers are provided', () => {
    const overrides: VisionOverrides = {
      ageEstimate: RESULT.ageEstimate,
      dermatitisSeverity: 'mild',
    };
    const onChange = vi.fn();
    render(
      <PetVisionCard
        vision={doneVision()}
        onPick={() => {}}
        overrides={overrides}
        onOverridesChange={onChange}
      />,
    );
    expect(screen.getByText('Adjust the estimate before saving')).toBeInTheDocument();

    const age = screen.getByLabelText('Age estimate') as HTMLInputElement;
    expect(age.value).toBe(RESULT.ageEstimate);
    fireEvent.change(age, { target: { value: 'Senior, 8+ years' } });
    expect(onChange).toHaveBeenCalledWith({ ...overrides, ageEstimate: 'Senior, 8+ years' });

    const severity = screen.getByLabelText('Skin / coat severity') as HTMLSelectElement;
    expect(severity.value).toBe('mild');
    fireEvent.change(severity, { target: { value: 'marked' } });
    expect(onChange).toHaveBeenCalledWith({ ...overrides, dermatitisSeverity: 'marked' });
  });

  it('reflects the overridden severity and age in the findings themselves', () => {
    render(
      <PetVisionCard
        vision={doneVision()}
        onPick={() => {}}
        overrides={{ ageEstimate: 'Senior, 9 years', dermatitisSeverity: 'marked' }}
        onOverridesChange={() => {}}
      />,
    );
    // chip label follows the correction, not the AI's original 'mild'
    expect(screen.getByText(/Skin \/ coat · marked/)).toBeInTheDocument();
    expect(screen.getByText('Senior, 9 years')).toBeInTheDocument();
    expect(screen.queryByText(RESULT.ageEstimate)).not.toBeInTheDocument();
  });

  it('omits the adjust row when no handler is provided (read-only usage)', () => {
    render(<PetVisionCard vision={doneVision()} onPick={() => {}} />);
    expect(screen.queryByText('Adjust the estimate before saving')).not.toBeInTheDocument();
    // findings fall back to the AI's own values
    expect(screen.getByText(/Skin \/ coat · mild/)).toBeInTheDocument();
  });
});
