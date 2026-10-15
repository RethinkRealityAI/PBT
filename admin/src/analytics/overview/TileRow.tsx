/**
 * A row of headline tiles that never leaves an orphan: six tiles go 6 → 3
 * → 2 across, four go 4 → 2 (by the row's own width, not the viewport's —
 * `AutoGrid` would wrap 5 + 1 or 3 + 1 at in-between widths). Above the
 * tiles, one caption says what the deltas compare against, so each chip can
 * stay short.
 */
import type { ReactNode } from 'react';
import { COLOR } from '../../lib/tokens';
import './styles';

export function TileRow({ count, compare, children }: { count: 4 | 6; compare?: string; children: ReactNode }) {
  return (
    <div className="pbt-ov-cq">
      {compare && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: COLOR.inkMute, margin: '0 4px 8px' }}>
          ▲▼ Change {compare}
        </div>
      )}
      <div className={`pbt-tiles pbt-tiles-${count}`}>{children}</div>
    </div>
  );
}
