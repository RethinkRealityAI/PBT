import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PetStep } from '../PetStep';
import { emptyAdminDraft } from '../../studioModel';
import { renderStep } from './harness';

const tile = (name: RegExp) => screen.getByRole('button', { name });

describe('PetStep', () => {
  it('species tiles patch the species; no species says it is treated as a dog', () => {
    const { patchSpy } = renderStep(PetStep);
    expect(screen.getByText('Not set — this scenario is treated as a dog.')).toBeInTheDocument();
    expect(tile(/^Dog Dogs/)).toHaveAttribute('aria-pressed', 'false');
    expect(tile(/^Cat Cats/)).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tile(/^Cat Cats/));
    expect(patchSpy).toHaveBeenCalledWith({ species: 'cat' });
    expect(tile(/^Cat Cats/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/treated as a dog/)).not.toBeInTheDocument();
  });

  it('breed shortcuts follow the species and fill the field', () => {
    const { patchSpy } = renderStep(PetStep, { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    // Cat shortcuts, not dog ones.
    expect(screen.queryByRole('button', { name: 'Labrador Retriever' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Maine Coon' }));
    expect(patchSpy).toHaveBeenCalledWith({ breed: 'Maine Coon' });
    expect(screen.getByLabelText('Breed name')).toHaveValue('Maine Coon');
    expect(screen.getByRole('button', { name: 'Maine Coon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('10/80')).toBeInTheDocument();
  });

  it('offers — never forces — clearing a breed from the other species', () => {
    const { patchSpy } = renderStep(PetStep, {
      draft: { ...emptyAdminDraft('admin:t'), species: 'dog', breed: 'Labrador Retriever' },
    });
    expect(screen.queryByText(/usually a/)).not.toBeInTheDocument();
    fireEvent.click(tile(/^Cat Cats/));
    expect(screen.getByText(/“Labrador Retriever” is usually a dog breed/)).toBeInTheDocument();
    // Still there until the admin says so.
    expect(screen.getByLabelText('Breed name')).toHaveValue('Labrador Retriever');
    fireEvent.click(screen.getByRole('button', { name: 'Clear the breed' }));
    expect(patchSpy).toHaveBeenLastCalledWith({ breed: null });
  });

  it('life stage tiles use the species’ words and store the shared vocabulary', () => {
    const { patchSpy } = renderStep(PetStep, { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    expect(screen.queryByRole('button', { name: /^Puppy/ })).not.toBeInTheDocument();
    fireEvent.click(tile(/^Kitten Under 1 year/));
    expect(patchSpy).toHaveBeenCalledWith({ life_stage: 'Puppy (<1)' });
    fireEvent.click(tile(/^Senior 7 years and older/));
    expect(patchSpy).toHaveBeenLastCalledWith({ life_stage: 'Senior (7+)' });
  });

  it('weight: parsed into the draft, emptied to null, validated on leaving the field', () => {
    const { patchSpy } = renderStep(PetStep);
    const input = screen.getByLabelText('Weight in kilograms');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '250' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ weight_kg: 250 });
    // Not while typing…
    expect(screen.queryByText(/limit is 200 kg/)).not.toBeInTheDocument();
    fireEvent.blur(input);
    // …but once they leave the field.
    expect(screen.getByText(/limit is 200 kg/)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(screen.getByText(/more than 0 kg/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ weight_kg: null });
    expect(screen.queryByText(/more than 0 kg/)).not.toBeInTheDocument();
  });

  it('library scenarios show the built-in value and can go back to it', () => {
    const base = { ...emptyAdminDraft('seed-1'), breed: 'Labrador Retriever', life_stage: 'Adult (3-7)' };
    const { patchSpy } = renderStep(PetStep, {
      source: 'library',
      base,
      draft: { ...base, breed: 'Beagle' },
    });
    expect(screen.getByText('Labrador Retriever', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use the built-in breed' }));
    expect(patchSpy).toHaveBeenLastCalledWith({ breed: 'Labrador Retriever' });
    expect(screen.queryByRole('button', { name: 'Use the built-in breed' })).not.toBeInTheDocument();
    // Unchanged fields stay quiet.
    expect(screen.queryByRole('button', { name: 'Use the built-in life stage' })).not.toBeInTheDocument();
  });

  it('hands the assistant a prompt', () => {
    const { props } = renderStep(PetStep);
    fireEvent.click(screen.getByRole('button', { name: /Suggest a breed and age/ }));
    expect(props.askAssistant).toHaveBeenCalledWith('Suggest a breed and age that fit this scenario');
  });

  it('read-only: values shown, every control disabled', () => {
    renderStep(PetStep, {
      canWrite: false,
      draft: { ...emptyAdminDraft('admin:t'), species: 'dog', breed: 'Beagle' },
    });
    expect(tile(/^Dog Dogs/)).toBeDisabled();
    expect(tile(/^Dog Dogs/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Breed name')).toBeDisabled();
    expect(screen.getByLabelText('Breed name')).toHaveValue('Beagle');
    expect(screen.getByRole('button', { name: 'Beagle' })).toBeDisabled();
    expect(tile(/^Adult 3–7 years/)).toBeDisabled();
    expect(screen.getByLabelText('Weight in kilograms')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Suggest a breed and age/ })).toBeDisabled();
  });
});
