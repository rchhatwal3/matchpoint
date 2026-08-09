import { progressFraction } from './progress';

describe('progressFraction', () => {
  it('reports the share of locations that have landed', () => {
    expect(progressFraction({ done: 0, total: 4 })).toBe(0);
    expect(progressFraction({ done: 1, total: 4 })).toBe(0.25);
    expect(progressFraction({ done: 4, total: 4 })).toBe(1);
  });

  it('reads a fetch with nothing to do as complete', () => {
    expect(progressFraction({ done: 0, total: 0 })).toBe(1);
    expect(progressFraction({ done: 0, total: -1 })).toBe(1);
  });

  it('clamps, so the bar can never outrun its track', () => {
    expect(progressFraction({ done: 9, total: 4 })).toBe(1);
    expect(progressFraction({ done: -3, total: 4 })).toBe(0);
  });
});
