import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { deriveVerdict, usePetAnalyzer } from '../usePetAnalyzer';
import { calorieFor } from '../../../data/calorieTable';

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

  it('load() replaces every field in one shot and recomputes derived values', () => {
    const { result } = renderHook(() => usePetAnalyzer());
    act(() =>
      result.current.load({
        name: 'Bailey',
        breed: 'Golden',
        weightKg: 34,
        bcs: 8,
        mcs: 'normal',
        activity: 'inactive',
      }),
    );
    expect(result.current.state).toEqual({
      name: 'Bailey',
      breed: 'Golden',
      weightKg: 34,
      bcs: 8,
      mcs: 'normal',
      activity: 'inactive',
    });
    expect(result.current.calorieTarget).toBe(
      calorieFor(34, 'inactive'),
    );
    expect(result.current.verdictResult.verdict).toBe('warn');
  });

  it('load() clears fields the previous pet had set', () => {
    const { result } = renderHook(() => usePetAnalyzer());
    act(() => result.current.update('name', 'Max'));
    act(() =>
      result.current.load({
        name: '',
        breed: 'Poodle',
        weightKg: 6,
        bcs: 5,
        mcs: 'normal',
        activity: 'active',
      }),
    );
    expect(result.current.state.name).toBe('');
  });
});
