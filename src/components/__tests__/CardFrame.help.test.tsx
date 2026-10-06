// The card frame's help action (M9 plan H Task 6, spec 5.1; H9): a life-buoy icon in the kicker
// row, between the Sources and the flag actions, for a card with a server id that is not a
// checkpoint, once the API has served a set. A card it adds shows "Added after this card" on the
// frame. `flagCard` and `currentSet` of src/data are replaced (the demo sets have neither); the
// help sheet talks to the real API client over a fake network.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { LifeBuoy } from 'lucide-react-native';
import { Text } from 'react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { FlagTarget } from '../../cards/FlagButton';
import { SourcesTarget } from '../../cards/cardSources';
import { currentSet, type Card } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { CardFrame } from '../CardFrame';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

jest.mock('../../data', () => ({
  ...jest.requireActual<object>('../../data'),
  flagCard: jest.fn(() => Promise.resolve()),
  currentSet: jest.fn(),
}));

const servedSet = jest.mocked(currentSet);
const SET = { feedDate: '2026-10-05', setNumber: 2 };

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SOURCES = [
  { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini-notation/', license: 'MIT' },
];
const CARD: Card = { ...cardsByType.quiz, id: idOf(2), sources: SOURCES };
/** The card the server adds, in the shape the feed serves. */
const ADDED = {
  id: idOf(9),
  type: 'concept',
  node: 'Speed',
  est_seconds: 30,
  title: 'Faster',
  body: 'The pattern plays faster.',
};
const HELP = 'Help with this card';
const ADDED_LINE = 'Added after this card';

beforeEach(() => {
  jest.useFakeTimers();
  servedSet.mockReturnValue(SET);
  // The frame's card is the second of two, and the page on screen.
  const set = { ...makeSet(0, [{ ...cardsByType.concept, id: idOf(1) }, CARD]), ...SET };
  useFeedStore.setState({ set, index: 1, answers: {} });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function renderFrame(card: Card | null) {
  const { wrapper: Cache } = queryWrapper();
  const frame = (
    <CardFrame type="quiz" kicker="Quiz · Mini-notation" meta="~20 s">
      <Text>body</Text>
    </CardFrame>
  );
  render(
    <Cache>
      {card === null ? (
        frame
      ) : (
        <FlagTarget card={card}>
          <SourcesTarget card={card}>{frame}</SourcesTarget>
        </FlagTarget>
      )}
    </Cache>,
  );
}

const helpAction = () => screen.queryByRole('button', { name: HELP });

describe('CardFrame help action', () => {
  it('draws the kicker row as kicker, time, sources, help, flag, the icon at size 14', () => {
    renderFrame(CARD);
    const row = screen.getByTestId('card-kicker-row');

    // Each child is a kicker text, or an action whose button is named by its label.
    const children = row.children.map((child) => {
      if (typeof child === 'string') return child;
      const text: unknown = child.props.children;
      return typeof text === 'string'
        ? text
        : String(within(child).getByRole('button').props.accessibilityLabel);
    });
    expect(children).toStrictEqual([
      'Quiz · Mini-notation',
      '~20 s',
      'Show me the source',
      HELP,
      'Flag this card',
    ]);
    const help = within(row).getByRole('button', { name: HELP });
    expect(within(help).UNSAFE_getByType(LifeBuoy).props.size).toBe(14);
  });

  it.each([
    ['a demo card, which has no id', cardsByType.quiz],
    ['the checkpoint', { ...cardsByType.checkpoint, id: idOf(5) }],
  ])('has no help action on %s', (_name, card: Card) => {
    renderFrame(card);

    expect(helpAction()).toBeNull();
  });

  it('has no help action on a frame that holds no card the feed drew (the Summary)', () => {
    renderFrame(null);

    expect(helpAction()).toBeNull();
  });

  it('has no help action when no set was served', () => {
    servedSet.mockReturnValue(null);
    renderFrame(CARD);

    expect(helpAction()).toBeNull();
  });

  it('adds a card after the current one, closes the sheet and shows the line for 3 seconds', async () => {
    serveApi({ 'POST /feed/extra': [json(200, { card: ADDED, added: 1 })] });
    renderFrame(CARD);

    fireEvent.press(screen.getByRole('button', { name: HELP }));
    fireEvent.press(screen.getByRole('button', { name: 'Test me' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(useFeedStore.getState().set?.cards.map((card) => card.id)).toStrictEqual([
      idOf(1),
      idOf(2),
      idOf(9),
    ]);
    expect(screen.queryByTestId('help-sheet')).toBeNull();
    expect(within(screen.getByTestId('card-frame')).getByText(ADDED_LINE)).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText(ADDED_LINE)).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText(ADDED_LINE)).toBeNull();
  });
});
