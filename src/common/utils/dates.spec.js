import {
  assertDateOrder,
  assertIsoDate,
  dateRangesOverlap,
} from './dates';

describe('dates', () => {
  it('assertIsoDate accepts valid date', () => {
    expect(() => assertIsoDate('2026-05-01', 'd')).not.toThrow();
  });

  it('assertDateOrder rejects inverted range', () => {
    expect(() => assertDateOrder('2026-05-05', '2026-05-01')).toThrow();
  });

  it('dateRangesOverlap detects overlap', () => {
    expect(dateRangesOverlap('2026-05-01', '2026-05-03', '2026-05-03', '2026-05-05')).toBe(
      true,
    );
  });

  it('dateRangesOverlap returns false when disjoint', () => {
    expect(dateRangesOverlap('2026-05-01', '2026-05-02', '2026-05-10', '2026-05-11')).toBe(
      false,
    );
  });
});
