// Rules for the checkpoint card: grading the learner's code against the card's rubric. Pure
// functions, no rendering.
//
// Rubric patterns come from card data as strings and are compiled with `new RegExp`. They are
// trusted here because the repo authors them in the bundled fixtures, and `patternSpeedMs` lets a
// test prove each one is fast. The length cap below limits input size; it does not bound
// backtracking time. Before rubric patterns arrive from a server, they must be vetted there or
// matched with an engine that cannot backtrack.
import type { CheckpointCard } from '../data';

/** The outcome of grading code against a checkpoint rubric. `results` follow rubric order. */
export type CheckpointGrade = {
  results: { label: string; passed: boolean }[];
  passCount: number;
  passed: boolean;
  feedback: 'all' | 'pass' | 'fail';
};

/** Only this many leading characters of the learner's code are graded. */
const MAX_CODE_LENGTH = 5000;

/** True when `pattern` matches `code`. A pattern that does not compile matches nothing. */
function matches(pattern: string, code: string): boolean {
  try {
    return new RegExp(pattern).test(code);
  } catch {
    return false;
  }
}

/** `'all'` when every item passed, `'pass'` when the threshold was met, otherwise `'fail'`. */
function feedbackFor(
  passCount: number,
  itemCount: number,
  passed: boolean,
): CheckpointGrade['feedback'] {
  if (!passed) return 'fail';
  return passCount === itemCount ? 'all' : 'pass';
}

/**
 * Grades the first 5,000 characters of `code` against each rubric item's pattern. The code passes
 * when at least `passThreshold` items match.
 */
export function gradeCheckpoint(
  code: string,
  card: Pick<CheckpointCard, 'rubric' | 'passThreshold'>,
): CheckpointGrade {
  const graded = code.slice(0, MAX_CODE_LENGTH);
  const results = card.rubric.map(({ label, regex }) => ({
    label,
    passed: matches(regex, graded),
  }));
  const passCount = results.filter((result) => result.passed).length;
  const passed = passCount >= card.passThreshold;
  return { results, passCount, passed, feedback: feedbackFor(passCount, results.length, passed) };
}

/**
 * Inputs as long as graded code can be, built so a pattern that backtracks badly struggles: runs
 * of an opening `<` with no closing `>`, of one letter, of the two alternating, and of spaces.
 */
const BACKTRACKING_PROBES = [
  '<'.repeat(MAX_CODE_LENGTH),
  'a'.repeat(MAX_CODE_LENGTH),
  '<a'.repeat(MAX_CODE_LENGTH / 2),
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
 * slow on every run. For tests over bundled rubrics; not called while the app runs.
 */
export function patternSpeedMs(pattern: string): number {
  return Math.max(...BACKTRACKING_PROBES.map((probe) => fastestRunMs(pattern, probe)));
}
