import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  bucketIndex,
  buckets,
  dayKey,
  fetchSince,
  formatDelta,
  pctDelta,
  pointsDelta,
  splitByPeriod,
  windows,
} from '../period';

const NOW = new Date('2026-10-15T12:00:00').getTime();

describe('windows', () => {
  it('pairs the current window with the same-length one before it', () => {
    const { current, previous } = windows('7d', NOW);
    expect(current.end - current.start).toBe(7 * DAY_MS);
    expect(previous).toEqual({ start: NOW - 14 * DAY_MS, end: NOW - 7 * DAY_MS });
  });

  it('has no previous window for all time', () => {
    expect(windows('all', NOW).previous).toBeNull();
    expect(fetchSince('all', NOW)).toBe(new Date(0).toISOString());
  });

  it('fetches twice the window so the comparison is in hand', () => {
    expect(new Date(fetchSince('28d', NOW)).getTime()).toBe(NOW - 56 * DAY_MS);
  });
});

describe('splitByPeriod', () => {
  it('splits rows into current and previous, dropping older ones', () => {
    const at = (days: number) => ({ created_at: new Date(NOW - days * DAY_MS).toISOString() });
    const rows = [at(1), at(6), at(8), at(13), at(20)];
    const { current, previous } = splitByPeriod(rows, '7d', NOW);
    expect(current).toHaveLength(2);
    expect(previous).toHaveLength(2);
  });

  it('counts a slightly-future row (clock skew) as current', () => {
    const { current } = splitByPeriod([{ created_at: new Date(NOW + 60_000).toISOString() }], '7d', NOW);
    expect(current).toHaveLength(1);
  });
});

describe('deltas', () => {
  it('is null with nothing to compare against', () => {
    expect(pctDelta(5, 0)).toBeNull();
    expect(pctDelta(5, null)).toBeNull();
    expect(pointsDelta(70, null)).toBeNull();
  });

  it('formats percentage and point changes with a direction', () => {
    expect(formatDelta(pctDelta(12, 10)!)).toEqual({ text: '20%', direction: 'up' });
    expect(formatDelta(pointsDelta(65, 70)!)).toEqual({ text: '5 pts', direction: 'down' });
    expect(formatDelta(pointsDelta(70.2, 70)!)).toEqual({ text: 'No change', direction: 'flat' });
    expect(formatDelta(pointsDelta(71, 70)!).text).toBe('1 pt');
  });
});

describe('buckets', () => {
  it('uses hours for 24h, days up to 35 days and weeks beyond', () => {
    expect(buckets('24h', NOW).list).toHaveLength(24);
    expect(buckets('28d', NOW)).toMatchObject({ granularity: 'day' });
    expect(buckets('28d', NOW).list).toHaveLength(28);
    expect(buckets('90d', NOW)).toMatchObject({ granularity: 'week' });
  });

  it('places a timestamp in its bucket and future skew in the newest', () => {
    const { list } = buckets('7d', NOW);
    expect(bucketIndex(list, NOW)).toBe(list.length - 1);
    expect(bucketIndex(list, NOW + 3 * DAY_MS)).toBe(list.length - 1);
    expect(bucketIndex(list, NOW - 30 * DAY_MS)).toBe(-1);
  });

  it('keys local calendar days', () => {
    expect(dayKey(new Date('2026-03-05T23:30:00').getTime())).toBe('2026-03-05');
  });
});

describe('buckets across a daylight-saving change', () => {
  it('keeps every day bucket on local midnight with its own label', () => {
    // 15 March 2026: the week before includes the US spring-forward (8 March)
    // when run in a DST zone; in a fixed zone it is simply 28 calendar days.
    const now = new Date(2026, 2, 15, 12, 0, 0).getTime();
    const { list } = buckets('28d', now);
    for (const b of list) {
      const s = new Date(b.start);
      expect([s.getHours(), s.getMinutes()]).toEqual([0, 0]);
    }
    const labels = list.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('Mar 8');
    // A noon session on 7 March lands in the "Mar 7" bucket.
    const i = bucketIndex(list, new Date(2026, 2, 7, 12).getTime());
    expect(list[i].label).toBe('Mar 7');
  });
});
