// The exercise card of a topic without Strudel (M6 hardening Task 8): an `sql` exercise shows the
// editor and Check, with no Play, no beat grid and no audio notice, and never starts the Strudel
// player. Check runs the card's `contains` checks as for a Strudel card (ExerciseCard.test.tsx).
import { AccessibilityInfo } from 'react-native';
import { screen, within } from '@testing-library/react-native';

import type { ExerciseCard as ExerciseCardData } from '../../data';
import { useStrudel } from '../../strudel/useStrudel';
import {
  badges,
  editor,
  isDisabled,
  press,
  renderExerciseCard,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const HIDDEN = { includeHiddenElements: true };
const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

const SQL_CARD: ExerciseCardData = {
  type: 'exercise',
  lang: 'sql',
  node: 'Window functions',
  estSeconds: 90,
  title: 'Rank each salary within its department',
  starterCode: 'SELECT depname, salary FROM empsalary;',
  checks: [{ kind: 'contains', value: 'PARTITION BY depname', ignoreWhitespace: true }],
  passMsg: 'Each department is ranked on its own.',
  failMsg: 'Split the rows into one partition per department.',
};
const SOLUTION =
  'SELECT depname, salary,\n  rank() OVER (PARTITION BY depname ORDER BY salary DESC)\nFROM empsalary;';

const demo = setUpExerciseCardTests();

beforeEach(() => {
  announce.mockClear();
});

describe('ExerciseCard for sql', () => {
  it('shows the starter code and Check, with no Play, grid or player, and never starts Strudel', () => {
    renderExerciseCard(SQL_CARD);

    expect(editor()).toHaveDisplayValue(SQL_CARD.starterCode);
    const controls = screen.getByTestId('exercise-controls');
    expect(within(controls).getAllByRole('button')).toStrictEqual([
      screen.getByRole('button', { name: 'Check' }),
    ]);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByTestId('beat-grid', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('exercise-divider')).toBeNull();
    expect(screen.queryByTestId('strudel-player', HIDDEN)).toBeNull();
    expect(useStrudel).not.toHaveBeenCalled();
    expect(screen.getByTestId('exercise-spacer')).toBeOnTheScreen();
  });

  it('fails the starter code: Not yet with the fail message, Next card disabled', () => {
    const { onNext } = renderExerciseCard(SQL_CARD);

    press('Check');

    expect(badges()).toStrictEqual([`Not yet: ${SQL_CARD.failMsg}`]);
    expect(storedAnswer()).toStrictEqual({
      kind: 'exercise',
      code: SQL_CARD.starterCode,
      result: 'fail',
    });
    expect(announce.mock.calls).toStrictEqual([[`Not yet. ${SQL_CARD.failMsg}`]]);
    press('Next card');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('passes the solution: Spec met, stored, Next card enabled; an edit clears it', () => {
    const { onNext } = renderExerciseCard(SQL_CARD);

    typeCode(SOLUTION);
    press('Check');

    expect(badges()).toStrictEqual([`Spec met: ${SQL_CARD.passMsg}`]);
    expect(storedAnswer()).toStrictEqual({ kind: 'exercise', code: SOLUTION, result: 'pass' });
    press('Next card');
    expect(onNext).toHaveBeenCalledTimes(1);

    typeCode(`${SOLUTION} `);
    expect(badges()).toStrictEqual([]);
    expect(isDisabled('Next card')).toBe(true);
  });

  it('still starts Strudel for the demo card', () => {
    renderExerciseCard(demo());

    expect(useStrudel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });
});
