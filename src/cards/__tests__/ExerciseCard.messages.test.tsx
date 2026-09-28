// The exercise card's one message slot: an audio notice and the check result never show together,
// since the card is too short for both. Kept apart from ExerciseCard.audio.test.tsx, which is at
// the file size limit.
import {
  badges,
  FAIL,
  isDisabled,
  PASS,
  PASSING,
  press,
  renderExerciseCard,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { setAudio, strudelActions } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const { clearError } = strudelActions;

const demo = setUpExerciseCardTests();

describe('ExerciseCard one message at a time', () => {
  it('a badge, then an audio error: only the notice, and the card stays passed', () => {
    renderExerciseCard(demo());
    typeCode(PASSING);
    press('Check');

    setAudio({ error: 'boom' });

    expect(badges()).toStrictEqual(['Audio error: boom']);
    expect(storedAnswer()).toMatchObject({ result: 'pass' });
    expect(isDisabled('Next card')).toBe(false);
  });

  it('an audio error, then Check: the error is cleared and only the badge shows', () => {
    renderExerciseCard(demo());
    setAudio({ error: 'boom' });

    press('Check');

    expect(clearError).toHaveBeenCalledTimes(1);
    expect(badges()).toStrictEqual([FAIL]);
  });

  it('Play covers the badge with the connection notice and keeps the result; Stop shows it', () => {
    renderExerciseCard(demo());
    typeCode(PASSING);
    press('Check');
    press('Play');

    setAudio({ needsNetwork: true });
    expect(badges()).toStrictEqual(['Audio needs a connection']);
    expect(storedAnswer()).toMatchObject({ result: 'pass' });

    press('Stop');
    expect(badges()).toStrictEqual([PASS]);
  });
});
