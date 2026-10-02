// The review card of a Strudel set can play its snippet once the answer is revealed (M9 plan I
// Task 4, X6): the revealed code is a `PlayableCode` with Play / Stop that never plays by itself.
// Before the reveal, and for a quoted snippet or a set that is not Strudel's, the card is drawn as
// before with no player. The player is the Strudel test double.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { FeedSet, ReviewCard as ReviewCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { PlayableCode } from '../PlayableCode';
import { ReviewCard } from '../ReviewCard';
import { reveal, revealButton } from '../testing/reviewCards';
import { resetStrudelDouble, strudelActions, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const INDEX = 2;
const ID = '00000000-0000-4000-8000-000000000002';
/** The demo's way: a review with no id. */
const UNSERVED: ReviewCardData = { ...cardsByType.review, snippet: 's("bd ~ sd ~")' };
const CARD: ReviewCardData = { ...UNSERVED, id: ID };
const QUOTED: ReviewCardData = { ...CARD, snippetStyle: 'quote' };
/** The parts of the revealed answer the tests follow, by test ID. */
const ANSWER_PARTS = /^(review-answer-text|code-block|playable-code|audio-notice)$/;

/** Starts a set of CARD in a topic of `lang`; undefined leaves the field out, as an older API. */
function startSetIn(lang: FeedSet['topic']['lang']): void {
  const { topic, ...rest } = makeSet(0, [CARD]);
  const store = useFeedStore.getState();
  store.startSet({ ...rest, topic: lang === undefined ? topic : { ...topic, lang } });
}

/** Draws `card` at INDEX, not yet revealed; `rerender` redraws it with another active flag. */
function renderCard(card: ReviewCardData = CARD) {
  const draw = (active: boolean) => (
    <ReviewCard card={card} index={INDEX} active={active} onNext={jest.fn()} />
  );
  const view = render(draw(true));
  return {
    rerender: (active: boolean) => {
      view.rerender(draw(active));
    },
  };
}

/** The test IDs of the revealed answer's parts, in order. */
function answerParts(): string[] {
  const parts = within(screen.getByTestId('review-answer')).getAllByTestId(ANSWER_PARTS);
  return parts.map(({ props }) => String(props.testID));
}

beforeEach(() => {
  jest.mocked(useStrudel).mockClear().mockImplementation(useStrudelDouble);
  resetStrudelDouble();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('ReviewCard in a Strudel set', () => {
  const { play, stop } = strudelActions;

  beforeEach(() => {
    startSetIn('strudel');
  });

  it('mounts no player and shows no control before the reveal', () => {
    renderCard();

    expect(revealButton()).toBeOnTheScreen();
    expect(screen.queryByTestId('playable-code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });

  it('draws the revealed snippet as playable code that waits for Play, named after the card', () => {
    renderCard();
    reveal();

    const block = screen.UNSAFE_getByType(PlayableCode);
    expect(block.props).toMatchObject({ code: CARD.snippet, autoplay: false, active: true });
    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX, cardId: ID });
    expect(answerParts()).toStrictEqual(['review-answer-text', 'playable-code', 'code-block']);
    expect(screen.getByTestId('code-block-code')).toHaveTextContent(CARD.snippet);
    expect(play).not.toHaveBeenCalled();
  });

  it('names the player by page alone for a card with no id', () => {
    renderCard(UNSERVED);
    reveal();

    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX });
  });

  it('plays the snippet when the learner taps Play, and Stop stops it', () => {
    renderCard();
    reveal();

    fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(play.mock.calls).toStrictEqual([[CARD.snippet]]);
    fireEvent.press(screen.getByRole('button', { name: 'Stop' }));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });

  it('stops its player when the card is left, and does not play when shown again', () => {
    const { rerender } = renderCard();
    reveal();
    fireEvent.press(screen.getByRole('button', { name: 'Play' }));

    rerender(false);
    expect(stop).toHaveBeenCalled();
    rerender(true);

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });

  it('draws a quoted snippet as before, with no player', () => {
    useFeedStore.getState().setAnswer(INDEX, { kind: 'review', revealed: true, rating: null });
    renderCard(QUOTED);

    expect(answerParts()).toStrictEqual(['review-answer-text']);
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });
});

describe('ReviewCard that does not play', () => {
  it.each([
    ['sql', 'sql'],
    ['null', null],
    ['absent (an older API)', undefined],
  ] as const)('draws the revealed code as before in a set whose language is %s', (_name, lang) => {
    startSetIn(lang);
    renderCard();
    reveal();

    expect(answerParts()).toStrictEqual(['review-answer-text', 'code-block']);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });

  it('draws the revealed code as before when no set is loaded', () => {
    renderCard();
    reveal();

    expect(answerParts()).toStrictEqual(['review-answer-text', 'code-block']);
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });
});
