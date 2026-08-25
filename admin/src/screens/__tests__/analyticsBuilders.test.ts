import { describe, expect, it } from 'vitest';
import { buildDwellHeatmap, buildFeatureUsage, buildTopInteractions } from '../AnalyticsScreen';
import type { NavEvent } from '../../data/types';

let nextId = 1;
function ev(partial: Partial<NavEvent>): NavEvent {
  return {
    id: String(nextId++),
    user_id: null,
    anon_session_id: 'anon-1',
    event_type: 'custom',
    screen: null,
    target: null,
    meta: null,
    dwell_ms: null,
    created_at: new Date().toISOString(),
    ...partial,
  } as NavEvent;
}

describe('buildDwellHeatmap', () => {
  it('aggregates dwell per screen with share and per-visit average', () => {
    const { rows, total, hasData } = buildDwellHeatmap([
      ev({ event_type: 'dwell', screen: 'home', dwell_ms: 60_000 }),
      ev({ event_type: 'dwell', screen: 'home', dwell_ms: 30_000 }),
      ev({ event_type: 'dwell', screen: 'chat', dwell_ms: 10_000 }),
      // ignored: wrong type, missing screen, non-positive
      ev({ event_type: 'screen_view', screen: 'home' }),
      ev({ event_type: 'dwell', screen: null, dwell_ms: 5_000 }),
      ev({ event_type: 'dwell', screen: 'chat', dwell_ms: 0 }),
    ]);
    expect(hasData).toBe(true);
    expect(total).toBe(100_000);
    expect(rows[0]).toMatchObject({ screen: 'home', ms: 90_000, visits: 2, avgMs: 45_000, share: 90 });
    expect(rows[1]).toMatchObject({ screen: 'chat', ms: 10_000, visits: 1, avgMs: 10_000, share: 10 });
  });

  it('reports no data when nothing qualifies', () => {
    expect(buildDwellHeatmap([ev({ event_type: 'screen_view', screen: 'home' })]).hasData).toBe(false);
  });
});

describe('buildTopInteractions', () => {
  it('counts card/cta/tab targets only', () => {
    const { rows, total } = buildTopInteractions([
      ev({ event_type: 'tab_change', target: 'history' }),
      ev({ event_type: 'tab_change', target: 'history' }),
      ev({ event_type: 'cta_click', target: 'start_todays_pick' }),
      ev({ event_type: 'custom', target: 'session_open' }),
    ]);
    expect(total).toBe(3);
    expect(rows[0]).toMatchObject({ target: 'history', count: 2 });
  });
});

describe('buildFeatureUsage', () => {
  it('counts custom targets with human labels', () => {
    const { rows, total, hasData } = buildFeatureUsage([
      ev({ event_type: 'custom', target: 'session_open' }),
      ev({ event_type: 'custom', target: 'session_open' }),
      ev({ event_type: 'custom', target: 'vision_analyze' }),
      ev({ event_type: 'custom', target: 'some_future_target' }),
      ev({ event_type: 'cta_click', target: 'start_todays_pick' }), // excluded
    ]);
    expect(hasData).toBe(true);
    expect(total).toBe(4);
    expect(rows[0]).toMatchObject({ target: 'Training session opened', count: 2 });
    expect(rows.map((r) => r.target)).toContain('Pet photo analyzed (vision)');
    // unknown targets fall back to the raw string
    expect(rows.map((r) => r.target)).toContain('some_future_target');
  });
});
