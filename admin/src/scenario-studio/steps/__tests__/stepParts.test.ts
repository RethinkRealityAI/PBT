import { describe, expect, it } from 'vitest';
import { maxColumnsTemplate } from '../stepParts';

describe('maxColumnsTemplate', () => {
  it('caps the columns at `max`, each at least `min` wide, never wider than the row', () => {
    expect(maxColumnsTemplate(2, 200)).toBe(
      'repeat(auto-fit, minmax(min(100%, max(200px, calc((100% - 10px) / 2))), 1fr))',
    );
    expect(maxColumnsTemplate(4, 120, 12)).toBe(
      'repeat(auto-fit, minmax(min(100%, max(120px, calc((100% - 36px) / 4))), 1fr))',
    );
  });
});
