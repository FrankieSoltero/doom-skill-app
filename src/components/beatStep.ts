// The beat grid's playhead column. Pure: the grid does not run a timer; its host passes the step.

/** Steps per row in the beat grid, docs/design/card-feed/README.md:99. */
export const GRID_STEPS = 16;

/**
 * The column the playhead lights for `step`, from 0 to 15, or null for no playhead. Null and any
 * step that is not finite mean stopped. Otherwise the step is rounded down and wrapped, so 16 is
 * column 0 and -1 is column 15.
 */
export function playheadColumn(step: number | null): number | null {
  if (step === null || !Number.isFinite(step)) return null;
  return ((Math.floor(step) % GRID_STEPS) + GRID_STEPS) % GRID_STEPS;
}
