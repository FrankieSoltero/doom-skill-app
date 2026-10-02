// The predict card of a Strudel set can play its code once an option is picked (M9 plan I Task 5,
// X6): the answered card's code is a `PlayableCode` with Play / Stop that never plays by itself.
// Before the pick, hearing the code would give the answer away, so the card is drawn as before with
// no player; so is a predict card in a set that is not Strudel's. The player is the Strudel test
// double.
import { fireEvent, screen } from '@testing-library/react-native';

import type { PredictCard as PredictCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { PlayableCode } from '../PlayableCode';
import { PredictCard } from '../PredictCard';
import { partsInOrder, pickOption } from '../testing/choiceCards';
import {
  expectPlayThenStop,
  renderWithActive,
  SILENT_LANGS,
  startSetIn,
} from '../testing/playingSets';
import { resetStrudelDouble, strudelActions, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const INDEX = 3;
const ID = '00000000-0000-4000-8000-000000000003';
/** The demo's way: a predict card with no id. */
const UNSERVED: PredictCardData = cardsByType.predict;
const CARD: PredictCardData = { ...UNSERVED, id: ID };
const [FIRST_OPTION = ''] = CARD.options;
/** The card's parts around its code, by test ID. */
const CODE_PARTS = /^(code-block|playable-code|choice-options)$/;
const { play, stop } = strudelActions;

/** Draws `card` at INDEX, active; the function it returns redraws it with another active flag. */
function renderCard(card: PredictCardData = CARD) {
  return renderWithActive((active) => (
    <PredictCard card={card} index={INDEX} active={active} onNext={jest.fn()} />
  ));
}

/** Asserts the card shows today's plain code block and mounted no player. */
function expectNoPlayer(): void {
  expect(partsInOrder(CODE_PARTS)).toStrictEqual(['code-block', 'choice-options']);
  expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.mocked(useStrudel).mockClear().mockImplementation(useStrudelDouble);
  resetStrudelDouble();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('PredictCard in a Strudel set', () => {
  beforeEach(() => {
    startSetIn([CARD], 'strudel');
  });

  it('mounts no player and shows no control before an option is picked', () => {
    renderCard();

    expectNoPlayer();
  });

  it('draws the code as playable code that waits for Play once an option is picked', () => {
    renderCard();
    pickOption(FIRST_OPTION);

    const block = screen.UNSAFE_getByType(PlayableCode);
    expect(block.props).toMatchObject({ code: CARD.code, autoplay: false, active: true });
    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX, cardId: ID });
    expect(partsInOrder(CODE_PARTS)).toStrictEqual([
      'playable-code',
      'code-block',
      'choice-options',
    ]);
    expect(screen.getByTestId('code-block-code')).toHaveTextContent(CARD.code, { exact: true });
    expect(play).not.toHaveBeenCalled();
  });

  it('draws playable code for an answer already stored at its index', () => {
    useFeedStore.getState().setAnswer(INDEX, { kind: 'choice', picked: 0 });
    renderCard();

    expect(screen.getByTestId('playable-code')).toBeOnTheScreen();
  });

  it('names the player by page alone for a card with no id', () => {
    renderCard(UNSERVED);
    pickOption(FIRST_OPTION);

    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX });
  });

  it('plays the code when the learner taps Play, and Stop stops it', () => {
    renderCard();
    pickOption(FIRST_OPTION);

    expectPlayThenStop(CARD.code);
  });

  it('stops its player when the card is left, and does not play when shown again', () => {
    const setActive = renderCard();
    pickOption(FIRST_OPTION);
    fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    stop.mockClear();

    setActive(false);
    expect(stop).toHaveBeenCalledTimes(1);
    setActive(true);

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });
});

describe('PredictCard that does not play', () => {
  it.each(SILENT_LANGS)('draws the answered code as before when the language is %s', (_, lang) => {
    startSetIn([CARD], lang);
    renderCard();
    pickOption(FIRST_OPTION);

    expect(screen.getByTestId('choice-explanation')).toBeOnTheScreen();
    expectNoPlayer();
  });

  it('draws the answered code as before when no set is loaded', () => {
    renderCard();
    pickOption(FIRST_OPTION);

    expect(screen.getByTestId('choice-explanation')).toBeOnTheScreen();
    expectNoPlayer();
  });
});
