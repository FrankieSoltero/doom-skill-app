import { GRID_STEPS, playheadColumn } from '../beatStep';

describe('playheadColumn', () => {
  it('has 16 columns', () => {
    expect(GRID_STEPS).toBe(16);
  });

  it.each([
    [null, null],
    [0, 0],
    [5, 5],
    [15, 15],
    [16, 0],
    [17, 1],
    [-1, 15],
    [-16, 0],
    [-17, 15],
    [5.9, 5],
    [-0.5, 15],
    [NaN, null],
    [Infinity, null],
    [-Infinity, null],
  ])('puts step %p in column %p', (step, expected) => {
    expect(playheadColumn(step)).toBe(expected);
  });
});
