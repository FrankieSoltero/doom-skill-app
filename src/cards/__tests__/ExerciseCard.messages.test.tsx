// The exercise card's one message slot: an audio notice and the check result never show together,
// since the card is too short for both, and the slot shows whichever happened last. Kept apart
// from ExerciseCard.audio.test.tsx, which is at the file size limit.
import { screen } from '@testing-library/react-native';

import { STRUDEL_ERROR, useStrudel } from '../../strudel/useStrudel';
import {
  badges,
  FAIL,
  INDEX,
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

/** The three notices that hold until the audio state changes, and whether each offers Reset. */
const HOLDING_NOTICES = [
  { name: 'unavailable', audio: { status: 'unavailable' as const }, reset: true },
  { name: 'needs-connection', audio: { playing: true, needsNetwork: true }, reset: false },
  { name: 'page_silent', audio: { error: STRUDEL_ERROR.pageSilent }, reset: true },
];
/** The label of a notice with no message, as `badges` reads it. */
const NOTICE_LABEL: Record<string, string> = {
  unavailable: 'Audio unavailable',
  'needs-connection': 'Audio needs a connection',
  page_silent: 'Audio unavailable',
};
const resetButton = () => screen.queryByRole('button', { name: 'Reset audio' });

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

describe.each(HOLDING_NOTICES)('ExerciseCard with the $name notice', ({ name, audio, reset }) => {
  const label = NOTICE_LABEL[name];

  it.each([
    { outcome: 'pass', code: PASSING, shown: PASS },
    { outcome: 'fail', code: null, shown: FAIL },
  ])('Check puts the $outcome badge in its place, message and all', ({ code, shown }) => {
    renderExerciseCard(demo());
    if (code !== null) typeCode(code);
    setAudio(audio);
    expect(badges()).toStrictEqual([label]);

    press('Check');

    expect(badges()).toStrictEqual([shown]);
    expect(resetButton()).toBeNull();
  });

  it('an edit after Check brings the notice back, with Reset where it has one', () => {
    renderExerciseCard(demo());
    setAudio(audio);
    press('Check');

    typeCode(PASSING);

    expect(badges()).toStrictEqual([label]);
    expect(resetButton() !== null).toBe(reset);
  });

  it('the notice arriving over a badge takes its place', () => {
    renderExerciseCard(demo());
    press('Check');
    expect(badges()).toStrictEqual([FAIL]);

    setAudio(audio);

    expect(badges()).toStrictEqual([label]);
    expect(storedAnswer()).toMatchObject({ result: 'fail' });
  });

  it('shows the notice over a stored result when the card mounts', () => {
    setAudio(audio);

    renderExerciseCard(demo(), {
      answers: { [INDEX]: { kind: 'exercise', code: PASSING, result: 'pass' } },
    });

    expect(badges()).toStrictEqual([label]);
    expect(isDisabled('Next card')).toBe(false);
  });
});

describe('ExerciseCard over a page that stopped answering', () => {
  it('Check and an edit leave page_silent for Reset: the notice comes back, Play stays off', () => {
    renderExerciseCard(demo());
    setAudio({ error: STRUDEL_ERROR.pageSilent });

    press('Check');
    expect(badges()).toStrictEqual([FAIL]);
    typeCode(PASSING);

    expect(badges()).toStrictEqual(['Audio unavailable']);
    expect(clearError).not.toHaveBeenCalled();
    expect(isDisabled('Play')).toBe(true);
  });

  it('a notice that goes away and comes back takes the slot again', () => {
    renderExerciseCard(demo());
    setAudio({ status: 'unavailable' });
    press('Check');

    setAudio({ status: 'ready' });
    expect(badges()).toStrictEqual([FAIL]);
    setAudio({ status: 'unavailable' });

    expect(badges()).toStrictEqual(['Audio unavailable']);
  });
});

describe('ExerciseCard and its player', () => {
  it('names itself to its player: its page, and its id when the API served it', () => {
    renderExerciseCard(demo());
    renderExerciseCard({ ...demo(), id: '00000000-0000-4000-8000-000000000305' });

    expect(useStrudel).toHaveBeenCalledWith({ cardIndex: INDEX });
    expect(useStrudel).toHaveBeenCalledWith({
      cardIndex: INDEX,
      cardId: '00000000-0000-4000-8000-000000000305',
    });
    expect(useStrudel).not.toHaveBeenCalledWith();
  });
});
