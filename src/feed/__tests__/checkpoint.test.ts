import { cardSource, type CheckpointCard } from '../../data';
import { gradeCheckpoint } from '../checkpoint';
import { patternSpeedMs } from '../testing/patternSpeed';

type Rubric = CheckpointCard['rubric'];

/** A card with the given rubric and threshold, for rules that do not depend on the fixture. */
function card(rubric: Rubric, passThreshold = 1): Pick<CheckpointCard, 'rubric' | 'passThreshold'> {
  return { rubric, passThreshold };
}

const kick = { label: 'Kick', regex: 'bd' };
const snare = { label: 'Snare', regex: '\\b(sd|cp)\\b' };
const SPEED_LIMIT_MS = 100;

// The checkpoint card of the bundled set, read through the data boundary (rule SS-6).
let fixture: CheckpointCard;

beforeAll(async () => {
  const set = await cardSource.getNextSet();
  const found = set?.cards.find((c): c is CheckpointCard => c.type === 'checkpoint');
  if (!found) throw new Error('The bundled set has no checkpoint card');
  fixture = found;
});

describe('gradeCheckpoint', () => {
  it('passes every rubric item for the fixture starter code', () => {
    const grade = gradeCheckpoint(fixture.starterCode, fixture);

    expect(grade.results.map((r) => r.passed)).toEqual([true, true, true, true]);
    expect(grade).toMatchObject({ passCount: 4, passed: true, feedback: 'all' });
  });

  it('passes at the threshold without every item', () => {
    const grade = gradeCheckpoint('stack(s("bd ~ sd ~"), s("hh*8"))', fixture);

    expect(grade).toMatchObject({ passCount: 3, passed: true, feedback: 'pass' });
  });

  it('fails below the threshold', () => {
    const grade = gradeCheckpoint('s("bd*4")', fixture);

    expect(grade).toMatchObject({ passCount: 1, passed: false, feedback: 'fail' });
  });

  it('respects word boundaries in a pattern', () => {
    expect(gradeCheckpoint('s("sdx")', card([snare])).results).toEqual([
      { label: 'Snare', passed: false },
    ]);
    expect(gradeCheckpoint('s("sd")', card([snare])).results).toEqual([
      { label: 'Snare', passed: true },
    ]);
  });

  it('passes nothing for empty code', () => {
    expect(gradeCheckpoint('', fixture)).toMatchObject({ passCount: 0, passed: false });
  });

  it('fails an item whose pattern does not compile, without throwing', () => {
    const rubric = [{ label: 'Broken', regex: '(' }, kick];

    expect(gradeCheckpoint('s("bd")', card(rubric)).results).toEqual([
      { label: 'Broken', passed: false },
      { label: 'Kick', passed: true },
    ]);
  });

  it('keeps rubric order and labels', () => {
    const rubric = [snare, kick, { label: 'Hats', regex: 'hh' }];

    expect(gradeCheckpoint('s("hh bd")', card(rubric)).results).toEqual([
      { label: 'Snare', passed: false },
      { label: 'Kick', passed: true },
      { label: 'Hats', passed: true },
    ]);
  });

  it('grades only the first 5,000 characters', () => {
    expect(gradeCheckpoint(`${'x'.repeat(4998)}bd`, card([kick])).passCount).toBe(1);
    expect(gradeCheckpoint(`${'x'.repeat(4999)}bd`, card([kick])).passCount).toBe(0);
  });

  it('does not report every item as feedback when the threshold is out of reach', () => {
    const grade = gradeCheckpoint('s("bd")', card([kick], 2));

    expect(grade).toMatchObject({ passCount: 1, passed: false, feedback: 'fail' });
  });
});

describe('patternSpeedMs', () => {
  it('finds every bundled rubric pattern fast on input built to provoke backtracking', () => {
    const slow = fixture.rubric
      .map(({ regex }) => ({ regex, ms: patternSpeedMs(regex) }))
      .filter(({ ms }) => ms >= SPEED_LIMIT_MS);

    expect(slow).toEqual([]);
  });

  it('measures a pattern that backtracks as slower than one that does not', () => {
    // `[^>]*>` retries from every start over a run of text with no `>`: quadratic, yet bounded.
    expect(patternSpeedMs('[^>]*>')).toBeGreaterThan(patternSpeedMs('bd') * 10);
  });
});
