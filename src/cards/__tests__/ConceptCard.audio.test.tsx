// The concept card of a Strudel set plays its snippet when it is shown (M9 plan I Task 3, X2-X5):
// its code block is a `PlayableCode` that autoplays once per visit, with Play / Stop, and the
// audio notice in place of the cycle tiles while the audio needs attention. Any other concept is
// drawn as before, with no player. The player is the Strudel test double.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { ConceptCard as ConceptCardData, FeedSet } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { ConceptCard } from '../ConceptCard';
import { PlayableCode } from '../PlayableCode';
import {
  resetStrudelDouble,
  setAudio,
  strudelActions,
  useStrudelDouble,
} from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const INDEX = 4;
const ID = '00000000-0000-4000-8000-000000000004';
/** The demo's way: a Strudel concept with no id. */
const UNSERVED: ConceptCardData = {
  ...cardsByType.concept,
  snippet: 'note("<c3 e3 g3>")',
  snippetComment: '// cycle 1 → c3',
  cycles: ['c3', 'e3', 'g3'],
};
const CARD: ConceptCardData = { ...UNSERVED, id: ID };
const { type, node, estSeconds, points, seenPoints, title, body } = CARD;
const NO_SNIPPET: ConceptCardData = {
  type,
  node,
  estSeconds,
  points,
  seenPoints,
  title,
  body,
  id: ID,
};
const { play, stop, reset } = strudelActions;

/** Starts a set of CARD whose topic has `lang` (absent when undefined). */
function startSetIn(lang: FeedSet['topic']['lang']): void {
  const set = makeSet(0, [CARD]);
  const topic = lang === undefined ? set.topic : { ...set.topic, lang };
  useFeedStore.getState().startSet({ ...set, topic });
}

/** Draws `card` at INDEX; `rerender` redraws it with another active flag. */
function renderCard(card: ConceptCardData = CARD, active = true) {
  const onNext = jest.fn<undefined, []>();
  const draw = (isActive: boolean) => (
    <ConceptCard card={card} index={INDEX} active={isActive} onNext={onNext} />
  );
  const view = render(draw(active));
  return {
    onNext,
    rerender: (isActive: boolean) => {
      view.rerender(draw(isActive));
    },
  };
}

/** The test ids of the card body's parts, in order. */
function partsInOrder(): string[] {
  const pattern = /^(code-block|playable-code|cycle-tiles|audio-notice|concept-spacer)$/;
  return within(screen.getByTestId('card-frame-body'))
    .getAllByTestId(pattern)
    .map((part) => String(part.props.testID));
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockClear().mockImplementation(useStrudelDouble);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ConceptCard in a Strudel set', () => {
  beforeEach(() => {
    startSetIn('strudel');
  });

  it('draws its snippet as autoplaying playable code, named after the card', () => {
    renderCard();

    const block = screen.UNSAFE_getByType(PlayableCode);
    expect(block.props).toMatchObject({ code: CARD.snippet, autoplay: true, active: true });
    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX, cardId: ID });
    expect(partsInOrder()).toStrictEqual([
      'playable-code',
      'code-block',
      'cycle-tiles',
      'concept-spacer',
    ]);
    expect(screen.getByTestId('code-block-comment')).toHaveTextContent('// cycle 1 → c3');
  });

  it('names the player by page alone for a card with no id', () => {
    renderCard(UNSERVED);

    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith({ cardIndex: INDEX });
  });

  it('plays the snippet once when shown with a ready player', () => {
    renderCard();

    expect(play.mock.calls).toStrictEqual([[CARD.snippet]]);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeOnTheScreen();
  });

  it('stays stopped after Stop, and Play plays the snippet again', () => {
    renderCard();

    fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    setAudio({ step: 2 });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Play' }));

    expect(play.mock.calls).toStrictEqual([[CARD.snippet], [CARD.snippet]]);
  });

  it('stops when left and autoplays again when shown again', () => {
    const { rerender } = renderCard(CARD, false);
    expect(play).not.toHaveBeenCalled();

    rerender(true);
    // Drawn inactive, the card stopped once already; count only the stop of leaving it.
    stop.mockClear();
    rerender(false);
    expect(stop).toHaveBeenCalledTimes(1);
    rerender(true);

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('shows the audio notice in place of the tiles, and Got it still works (X5)', () => {
    const { onNext } = renderCard();

    setAudio({ status: 'unavailable', playing: false });
    expect(partsInOrder()).toStrictEqual([
      'playable-code',
      'code-block',
      'audio-notice',
      'concept-spacer',
    ]);
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Reset audio' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('cycle-tile')).toHaveLength(3);
  });

  it('moves the tile highlight on its own timer while the snippet plays (X4)', () => {
    jest.useFakeTimers();
    renderCard();
    const lifted = () =>
      screen
        .getAllByTestId('cycle-tile')
        .findIndex((tile) => JSON.stringify(tile.props.style).includes('translateY'));
    expect(lifted()).toBe(0);

    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(lifted()).toBe(1);
  });
});

describe('ConceptCard that does not play', () => {
  it.each([
    ['sql', 'sql'],
    ['null', null],
    ['absent (an older API)', undefined],
  ] as const)('draws the code as before in a set whose language is %s', (_name, lang) => {
    startSetIn(lang);
    renderCard();

    expect(partsInOrder()).toStrictEqual(['code-block', 'cycle-tiles', 'concept-spacer']);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });

  it('draws the code as before when no set is loaded', () => {
    renderCard();

    expect(screen.getByTestId('code-block')).toBeOnTheScreen();
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });

  it.each([
    ['a quoted snippet', { ...CARD, snippetStyle: 'quote' as const }],
    ['no snippet', NO_SNIPPET],
  ])('mounts no player for %s in a Strudel set', (_name, card) => {
    startSetIn('strudel');
    renderCard(card);

    expect(screen.queryByTestId('playable-code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(jest.mocked(useStrudel)).not.toHaveBeenCalled();
  });
});
