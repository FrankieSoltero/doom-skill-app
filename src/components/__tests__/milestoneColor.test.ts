import { colors } from '../../theme';
import { milestoneColor } from '../milestoneColor';

describe('milestoneColor', () => {
  it.each([
    [1, colors.lime],
    [2, colors.violet],
    [3, colors.aqua],
    [4, colors.pink],
    [5, colors.lime],
    [8, colors.pink],
    [0, colors.pink],
  ])('colors milestone %i', (position, color) => {
    expect(milestoneColor(position)).toBe(color);
  });
});
