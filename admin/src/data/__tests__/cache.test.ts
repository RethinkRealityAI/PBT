/**
 * The shared admin cache: one request per key, revalidation, the HTTP status
 * of a failure, and a full reset (called when the signed-in admin changes so
 * one admin's answers never reach the next).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fetchCached, invalidate, resetCache, useCachedQuery } from '../cache';
import { ApiError } from '../../lib/api';

afterEach(() => resetCache());

describe('fetchCached', () => {
  it('shares one in-flight request per key', async () => {
    const fn = vi.fn(async () => 42);
    const [a, b] = await Promise.all([fetchCached('k', fn), fetchCached('k', fn)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('useCachedQuery', () => {
  it('serves a second consumer from memory', async () => {
    const fn = vi.fn(async () => ['row']);
    const first = renderHook(() => useCachedQuery('rows', fn, []));
    await waitFor(() => expect(first.result.current.data).toEqual(['row']));
    const second = renderHook(() => useCachedQuery('rows', fn, []));
    expect(second.result.current.data).toEqual(['row']);
    expect(second.result.current.loading).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps the HTTP status of a failure, so "not found" is a status, not a guess at wording', async () => {
    const fn = vi.fn(async () => {
      throw new ApiError(404, { error: 'Session not found' });
    });
    const { result } = renderHook(() => useCachedQuery('missing', fn, null));
    await waitFor(() => expect(result.current.error).toBe('Session not found'));
    expect(result.current.errorStatus).toBe(404);
  });

  it('skips the fetch for a null key', () => {
    const fn = vi.fn(async () => 1);
    const { result } = renderHook(() => useCachedQuery(null, fn, 0));
    expect(result.current).toMatchObject({ data: 0, loading: false, error: null });
    expect(fn).not.toHaveBeenCalled();
  });

  it('forgets everything on reset — the next admin starts from nothing', async () => {
    let answer = 'owner data';
    const fn = vi.fn(async () => answer);
    const a = renderHook(() => useCachedQuery('who', fn, ''));
    await waitFor(() => expect(a.result.current.data).toBe('owner data'));
    a.unmount();
    act(() => resetCache());
    answer = 'analyst data';
    const b = renderHook(() => useCachedQuery('who', fn, ''));
    expect(b.result.current.data).toBe('');
    await waitFor(() => expect(b.result.current.data).toBe('analyst data'));
  });

  it('refetches a key after invalidate()', async () => {
    let n = 0;
    const fn = vi.fn(async () => ++n);
    const { result } = renderHook(() => useCachedQuery('count', fn, 0));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => invalidate('count'));
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});
