/**
 * Hash routes — destination / tab / record. The third segment is what makes
 * a trainee's profile and a single session linkable.
 */
import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from '../route';

describe('parseRoute', () => {
  it('reads destination and tab', () => {
    expect(parseRoute('#/analytics/skills')).toEqual({ screen: 'analytics', tab: 'skills' });
    expect(parseRoute('#/flags')).toEqual({ screen: 'flags', tab: null });
  });

  it('reads a record id under a tab', () => {
    expect(parseRoute('#/analytics/trainees/0000-ab_c')).toEqual({
      screen: 'analytics',
      tab: 'trainees',
      id: '0000-ab_c',
    });
  });

  it('ignores an id without a tab, and unsafe segments', () => {
    expect(parseRoute('#/analytics//abc')).toEqual({ screen: 'analytics', tab: null });
    expect(parseRoute('#/analytics/trainees/<script>')).toEqual({ screen: 'analytics', tab: 'trainees' });
    expect(parseRoute('#/')).toBeNull();
  });

  it('drops a query string', () => {
    expect(parseRoute('#/analytics/sessions/s1?x=1')).toEqual({ screen: 'analytics', tab: 'sessions', id: 's1' });
  });
});

describe('formatRoute', () => {
  it('round-trips every shape', () => {
    for (const hash of ['#/flags', '#/analytics/overview', '#/analytics/trainees/u-1']) {
      expect(formatRoute(parseRoute(hash)!)).toBe(hash);
    }
  });

  it('never writes an id without a tab', () => {
    expect(formatRoute({ screen: 'analytics', tab: null, id: 'x' })).toBe('#/analytics');
    expect(formatRoute({ screen: 'analytics', tab: 'sessions', id: null })).toBe('#/analytics/sessions');
  });
});
