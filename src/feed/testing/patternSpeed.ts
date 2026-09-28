// Test support: times a checkpoint rubric pattern on input built to provoke backtracking. Tests
// over bundled rubrics import it; app code does not. It lives outside `__tests__/` because Jest
// runs every file there as a suite.
import { gradeCheckpoint, MAX_CODE_LENGTH } from '../checkpoint';

/**
 * Inputs as long as graded code can be, built so a pattern that backtracks badly struggles: runs
 * of an opening `<` with no closing `>`, of one letter, of the two alternating, and of spaces.
 */
const BACKTRACKING_PROBES = [
  '<'.repeat(MAX_CODE_LENGTH),
  'a'.repeat(MAX_CODE_LENGTH),
  '<a'.repeat(MAX_CODE_LENGTH).slice(0, MAX_CODE_LENGTH),
  ' '.repeat(MAX_CODE_LENGTH),
];
const TIMED_RUNS = 5;

/** The fastest of five timed gradings of `probe` against `pattern`, in milliseconds. */
function fastestRunMs(pattern: string, probe: string): number {
  const card = { rubric: [{ label: pattern, regex: pattern }], passThreshold: 1 };
  const runs = Array.from({ length: TIMED_RUNS }, () => {
    const start = performance.now();
    gradeCheckpoint(probe, card);
    return performance.now() - start;
  });
  return Math.min(...runs);
}

/**
 * How long grading takes with `pattern` in the worst case the probes find: for each probe the
 * fastest of five runs, then the slowest probe, in milliseconds. Taking the fastest run keeps a
 * loaded machine from inflating a sound pattern's time, while a pattern that backtracks badly is
 * slow on every run.
 */
export function patternSpeedMs(pattern: string): number {
  return Math.max(...BACKTRACKING_PROBES.map((probe) => fastestRunMs(pattern, probe)));
}
