// Rules for the checkpoint card: grading the learner's code against the card's rubric. Pure
// functions, no rendering.
//
// Rubric patterns come from card data as strings and are compiled with `new RegExp`. The server
// vets every pattern before it is stored (M2's `app.llm.patterns.safe_pattern`: no backreferences,
// no lookaround, no unbounded repeats, a bounded choice product), and a test times each bundled
// one on input built to provoke backtracking. As a second guard here, a pattern longer than 80
// characters, or one that does not compile, is never run: its row is not met. The code length cap
// limits input size; it does not bound backtracking time.
import type { CheckpointCard } from '../data';

/**
 * The outcome of grading code against a checkpoint rubric. `results` follow rubric order.
 * `feedback` is `'fail'` whenever `passed` is false. The schema refuses a card whose
 * `passThreshold` is greater than its rubric size; given one anyway, the grade is `'fail'` even
 * when every item passes.
 */
export type CheckpointGrade = {
  results: { label: string; passed: boolean }[];
  passCount: number;
  passed: boolean;
  feedback: 'all' | 'pass' | 'fail';
};

/** Only this many leading characters of the learner's code are graded. */
export const MAX_CODE_LENGTH = 5000;

/** The longest rubric pattern that is run. A longer one marks its row as not met. */
export const MAX_PATTERN_LENGTH = 80;

/**
 * True when `pattern` matches `code`. A pattern longer than `MAX_PATTERN_LENGTH`, or one that does
 * not compile, matches nothing.
 */
function matches(pattern: string, code: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
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
