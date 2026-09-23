import { formatScore } from '../format';

describe('formatScore', () => {
  it('uses a decimal point in English and a decimal comma in French', () => {
    expect(formatScore(2.5, 'en')).toBe('2.5');
    expect(formatScore(2.5, 'fr')).toBe('2,5');
  });

  it('prints whole chart scores without a fraction', () => {
    expect(formatScore(3, 'en')).toBe('3');
    expect(formatScore(3, 'fr')).toBe('3');
  });
});
