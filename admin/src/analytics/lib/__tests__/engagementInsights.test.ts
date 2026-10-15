import { describe, expect, it } from 'vitest';
import {
  CONTEXT_HUES,
  CONTEXT_OTHER,
  activeDaysLabel,
  bucketLabel,
  contextParts,
  fmtDwell,
  heatSummary,
  hourRange,
  hourTick,
  hourWords,
  peakSentence,
  returningRate,
  screensPerVisitor,
} from '../engagementInsights';

function grid(cells: Array<[number, number, number]>): number[][] {
  const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [d, h, v] of cells) g[d][h] = v;
  return g;
}

describe('hours', () => {
  it('labels ticks and spoken hours', () => {
    expect([0, 3, 8, 12, 15, 21].map(hourTick)).toEqual(['12a', '3a', '8a', '12p', '3p', '9p']);
    expect([0, 8, 12, 15].map(hourWords)).toEqual(['midnight', '8 am', 'noon', '3 pm']);
    expect(hourRange(8)).toBe('8–9 am');
    expect(hourRange(11)).toBe('11 am–noon');
    expect(hourRange(12)).toBe('noon–1 pm');
    expect(hourRange(23)).toBe('11 pm–midnight');
  });
});

describe('heatSummary / peakSentence', () => {
  it('names the busiest weekday-hour', () => {
    const g = grid([
      [2, 8, 9],
      [4, 13, 5],
      [6, 10, 2],
    ]);
    expect(peakSentence(g)).toBe('Busiest: Tuesdays around 8 am');
    const s = heatSummary(g);
    expect(s.total).toBe(16);
    expect(s.busiestDay).toMatchObject({ weekday: 2, views: 9 });
    expect(s.busiestHour).toMatchObject({ hour: 8, views: 9 });
    expect(s.weekendShare).toBeCloseTo(12.5);
  });

  it('breaks a tie toward the earlier work day', () => {
    expect(peakSentence(grid([[0, 9, 4], [1, 9, 4]]))).toBe('Busiest: Mondays around 9 am');
  });

  it('says nothing for an empty or ragged grid', () => {
    expect(peakSentence(grid([]))).toBeNull();
    expect(peakSentence([])).toBeNull();
    expect(heatSummary([[1]]).total).toBe(1); // a short grid is read as far as it goes
  });
});

describe('durations & rates', () => {
  it('formats time in app', () => {
    expect(fmtDwell(0)).toBe('0m');
    expect(fmtDwell(25_000)).toBe('25s');
    expect(fmtDwell(45 * 60_000)).toBe('45m');
    expect(fmtDwell(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(fmtDwell(2 * 3_600_000)).toBe('2h');
  });

  it('computes returning rate and screens per visitor', () => {
    expect(returningRate({ visitors: 20, returning_visitors: 5 })).toBe(25);
    expect(returningRate({ visitors: 0, returning_visitors: 0 })).toBeNull();
    expect(screensPerVisitor({ visitors: 4, screen_views: 10 })).toBe(2.5);
    expect(screensPerVisitor(null)).toBeNull();
  });

  it('labels active-day buckets', () => {
    expect(['1', '2', '3-5', '6-10', '11+'].map(activeDaysLabel)).toEqual(['1 day', '2 days', '3–5 days', '6–10 days', '11+ days']);
  });
});

describe('contextParts', () => {
  const labels = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' };
  const order = ['mobile', 'tablet', 'desktop'];

  it('keeps each value its own hue whatever its rank', () => {
    const a = contextParts([{ value: 'desktop', visitors: 9 }, { value: 'mobile', visitors: 3 }], labels, order);
    expect(a).toEqual([
      { key: 'mobile', label: 'Phone', value: 3, color: CONTEXT_HUES[0] },
      { key: 'desktop', label: 'Computer', value: 9, color: CONTEXT_HUES[2] },
    ]);
  });

  it('folds unknown values into one grey Other', () => {
    const a = contextParts(
      [
        { value: 'mobile', visitors: 3 },
        { value: 'fridge', visitors: 1 },
        { value: 'other', visitors: 2 },
      ],
      labels,
      order,
    );
    expect(a[a.length - 1]).toEqual({ key: 'other', label: 'Other', value: 3, color: CONTEXT_OTHER });
  });

  it('is empty for an empty or missing breakdown', () => {
    expect(contextParts([], labels, order)).toEqual([]);
    expect(contextParts(undefined, labels, order)).toEqual([]);
  });
});

describe('bucketLabel', () => {
  const start = new Date(2026, 9, 14, 15, 0, 0).getTime(); // Wed Oct 14, 3 pm local
  it('labels hourly, daily and weekly buckets', () => {
    expect(bucketLabel(start, 'hour')).toBe('3 pm');
    expect(bucketLabel(start, 'hour', true)).toBe('Wed, Oct 14 · 3–4 pm');
    expect(bucketLabel(start, 'day')).toBe('Oct 14');
    expect(bucketLabel(start, 'day', true)).toBe('Wed, Oct 14');
    expect(bucketLabel(start, 'week', true)).toBe('Week of Oct 14');
    expect(bucketLabel(Number.NaN, 'day')).toBe('');
  });
});
