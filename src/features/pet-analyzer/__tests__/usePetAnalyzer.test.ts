import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { deriveVerdict, usePetAnalyzer } from '../usePetAnalyzer';

describe('deriveVerdict', () => {
  it('flags BCS 7+ as warn', () => {
    expect(
      deriveVerdict({
        name: '',
        breed: '',
        weightKg: 30,
        bcs: 8,
        mcs: 'normal',
        activity: 'active',
      }).verdict,
    ).toBe('warn');
  });

  it('marks BCS 4-6 with normal muscle as good', () => {
    expect(
      deriveVerdict({
        name: '',
        breed: '',
        weightKg: 12,
        bcs: 5,
        mcs: 'normal',
        activity: 'active',
      }).verdict,
    ).toBe('good');
  });

  it('warns when MCS is not normal regardless of BCS', () => {
    expect(
      deriveVerdict({
        name: '',
        breed: '',
        weightKg: 12,
        bcs: 5,
        mcs: 'mild',
        activity: 'active',
      }).verdict,
    ).toBe('warn');
  });

  it('warns when underweight', () => {
    expect(
      deriveVerdict({
        name: '',
        breed: '',
        weightKg: 6,
        bcs: 2,
        mcs: 'normal',
        activity: 'active',
      }).verdict,
    ).toBe('warn');
  });
});

describe('usePetAnalyzer', () => {
  it('recomputes calorieTarget on weight + activity changes', () => {
    const { result } = renderHook(() => usePetAnalyzer());
    const initial = result.current.calorieTarget;
    act(() => result.current.update('weightKg', 25));
    expect(result.current.calorieTarget).not.toBe(initial);
    act(() => result.current.update('activity', 'inactive'));
    expect(result.current.calorieTarget).toBeLessThan(initial * 2);
  });
});
