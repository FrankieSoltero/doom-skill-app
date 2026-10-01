import { colors } from '../theme';

/**
 * The milestone colors in order (the theme's comments: lime is milestone 1, violet 2, aqua 3,
 * pink 4); a fifth milestone starts the cycle again.
 */
const MILESTONE_COLORS = [colors.lime, colors.violet, colors.aqua, colors.pink];

/** The color of the milestone at `position`, counted from 1. */
export function milestoneColor(position: number): string {
  const index =
    (((Math.trunc(position) - 1) % MILESTONE_COLORS.length) + MILESTONE_COLORS.length) %
    MILESTONE_COLORS.length;
  return MILESTONE_COLORS[index] ?? colors.lime;
}
