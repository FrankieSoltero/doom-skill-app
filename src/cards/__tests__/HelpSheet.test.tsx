// "Help with this card" (M9 plan H Task 6, spec 5.2): the sheet's two rows add a card to the
// running set through `POST /feed/extra`, over the real API client and a fake network. An added
// card lands right after the current card; every other answer leaves one line in the sheet, and
// "Go deeper" with nothing to add opens the source sheet with all the node's passages.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import type { Card } from '../../data';
import * as feedActions from '../../data/feedActions';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { HelpSheet } from '../HelpSheet';
import { SourcesTarget } from '../SourcesButton';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const SET = { feedDate: '2026-10-05', setNumber: 2 };
const mockCurrentSet = jest.fn<typeof SET | null, []>();
jest.mock('../../data', () => ({
  ...jest.requireActual<object>('../../data'),
  currentSet: () => mockCurrentSet(),
}));

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CARD_ID = idOf(2);
const ADDED_ID = idOf(9);
const EXTRA = 'POST /feed/extra';
const SOURCE = `GET /cards/${CARD_ID}/source`;
const LINK = { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini-notation/' };
const CARD: Card = { ...cardsByType.quiz, id: CARD_ID, sources: [{ ...LINK, license: 'MIT' }] };
/** The card the server adds, in the shape the feed serves. */
const ADDED = {
  id: ADDED_ID,
  type: 'cloze',
  node: 'Speed',
  est_seconds: 30,
  sources: [],
  title: 'Pick one',
  text: 'A ___ fills the gap.',
  options: ['One', 'Two'],
  correct: 1,
  explanation: 'Because **two**.',
};
const NO_CONTENT = () => new Response(null, { status: 204 });

const onClose = jest.fn<undefined, []>();
const onAdded = jest.fn<undefined, []>();

beforeEach(() => {
  jest.useFakeTimers();
  mockCurrentSet.mockReturnValue(SET);
  onClose.mockClear();
  onAdded.mockClear();
  // The learner is on the second card (index 1) of a set of three the API served.
  const cards: Card[] = [1, 2, 3].map((n) => ({ ...cardsByType.concept, id: idOf(n) }));
  cards[1] = CARD;
  useFeedStore.setState(
    { ...useFeedStore.getInitialState(), set: { ...makeSet(0, cards), ...SET }, index: 1 },
    true,
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function renderSheet() {
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <SourcesTarget card={CARD}>
        <HelpSheet cardId={CARD_ID} index={1} onClose={onClose} onAdded={onAdded} />
      </SourcesTarget>
    </Cache>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

const testMe = () => screen.getByRole('button', { name: 'Test me' });
const deeper = () => screen.getByRole('button', { name: 'Go deeper' });
const ids = () => (useFeedStore.getState().set?.cards ?? []).map((card) => card.id);

/** Opens the sheet with `answer` for the extra route, presses `row` and lets the answer land. */
async function press(row: () => ReturnType<typeof testMe>, answer: Answer) {
  const requests = serveApi({ [EXTRA]: [answer] });
  renderSheet();
  fireEvent.press(row());
  await settle();
  return requests;
}

/** Asserts both rows are enabled (`true`) or disabled (`false`). */
function expectRowsEnabled(enabled: boolean): void {
  for (const row of [testMe(), deeper()]) {
    if (enabled) expect(row).toBeEnabled();
    else expect(row).toBeDisabled();
  }
}

describe('HelpSheet rows and an added card', () => {
  it('shows two rows, each with its hint, and no text field', () => {
    renderSheet();
    const sheet = screen.getByTestId('help-sheet');

    expect(within(sheet).getByRole('header')).toHaveTextContent('Help with this card');
    expect(testMe()).toHaveAccessibleName('Test me');
    expect(within(sheet).getByText('One more practice card on this idea')).toBeOnTheScreen();
    expect(within(sheet).getByText('The next idea that builds on this one')).toBeOnTheScreen();
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
    expectRowsEnabled(true);
  });

  it('disables both rows with the adding line while the request is in flight', async () => {
    serveApi({ [EXTRA]: [new Promise<Response>(() => undefined)] });
    renderSheet();

    fireEvent.press(testMe());
    await settle();

    expect(screen.getByText('Adding…')).toBeOnTheScreen();
    expectRowsEnabled(false);
  });

  it('posts Test me with the card and the served set, then inserts the card after this one', async () => {
    const requests = await press(testMe, json(200, { card: ADDED, added: 1 }));

    expect(requests.map((r) => r.body)).toStrictEqual([
      { card_id: CARD_ID, action: 'test', feed_date: SET.feedDate, set_number: SET.setNumber },
    ]);
    expect(ids()).toStrictEqual([idOf(1), CARD_ID, ADDED_ID, idOf(3)]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('inserts the card at index + 1 through the store', async () => {
    const insertCard = jest.spyOn(useFeedStore.getState(), 'insertCard');
    await press(deeper, json(200, { card: ADDED, added: 1 }));

    expect(insertCard).toHaveBeenCalledTimes(1);
    expect(insertCard).toHaveBeenCalledWith(expect.objectContaining({ id: ADDED_ID }), 2);
  });

  it('posts Go deeper with the deeper action', async () => {
    const requests = await press(deeper, json(200, { card: ADDED, added: 2 }));

    expect(requests.map((r) => r.body)).toStrictEqual([
      { card_id: CARD_ID, action: 'deeper', feed_date: SET.feedDate, set_number: SET.setNumber },
    ]);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });
});

describe('HelpSheet with nothing to add', () => {
  it('says there is nothing more to add after Test me with nothing, rows enabled', async () => {
    await press(testMe, NO_CONTENT());

    expect(screen.getByText('Nothing more to add here')).toBeOnTheScreen();
    expectRowsEnabled(true);
    expect(ids()).toHaveLength(3);
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('becomes the source sheet with all the passages after Go deeper with nothing', async () => {
    const requests = serveApi({
      [EXTRA]: [NO_CONTENT()],
      [SOURCE]: [json(200, { passages: [], sources: [{ ...LINK, license: 'MIT' }] })],
    });
    renderSheet();

    fireEvent.press(deeper());
    await settle();

    expect(screen.queryByTestId('help-sheet')).toBeNull();
    expect(screen.getByTestId('sources-sheet')).toBeOnTheScreen();
    expect(requests.map((r) => `${r.method} ${r.path}${r.query}`)).toStrictEqual([
      'POST /feed/extra',
      `GET /cards/${CARD_ID}/source?all=true`,
    ]);
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe('HelpSheet on a full set or a failure', () => {
  it('says the set is full on a 429, both rows disabled until it closes', async () => {
    await press(testMe, json(429, { detail: 'Too many added cards' }));

    expect(screen.getByText('This set is full')).toBeOnTheScreen();
    expectRowsEnabled(false);
  });

  it.each([
    ['404', json(404, { detail: 'Not found' })],
    ['409', json(409, { detail: 'Not in the feed' })],
  ])('says there is nothing more to add on a %s (not in the feed)', async (_status, answer) => {
    await press(deeper, answer);

    expect(screen.getByText('Nothing more to add here')).toBeOnTheScreen();
    expect(screen.queryByTestId('sources-sheet')).toBeNull();
    expectRowsEnabled(true);
  });

  it('says the card may appear after a reload when offline, rows disabled', async () => {
    const requests = await press(testMe, new TypeError('Network request failed'));

    expect(requests).toHaveLength(1);
    expect(screen.getByText('The card may appear after a reload')).toBeOnTheScreen();
    expectRowsEnabled(false);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('says the card may appear after a reload on a timeout, rows disabled', async () => {
    // The fake network cannot time out (it never sees the abort), so the client's error is given.
    serveApi({});
    jest.spyOn(feedActions, 'addExtra').mockRejectedValue(new ApiError('timeout', 0));
    renderSheet();

    fireEvent.press(deeper());
    await settle();

    expect(screen.getByText('The card may appear after a reload')).toBeOnTheScreen();
    expectRowsEnabled(false);
  });

  it('says it could not add a card on any other error, rows enabled again', async () => {
    await press(testMe, json(500, { detail: 'Server error' }));

    expect(screen.getByText('Could not add a card right now')).toBeOnTheScreen();
    expectRowsEnabled(true);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('says it could not add a card when the added card is unreadable', async () => {
    await press(testMe, json(200, { card: { ...ADDED, type: 'mystery' }, added: 1 }));

    expect(screen.getByText('Could not add a card right now')).toBeOnTheScreen();
    expect(ids()).toHaveLength(3);
  });

  it('says there is nothing more to add when no set was served, and sends nothing', async () => {
    mockCurrentSet.mockReturnValue(null);
    const requests = await press(testMe, NO_CONTENT());

    expect(requests).toHaveLength(0);
    expect(screen.getByText('Nothing more to add here')).toBeOnTheScreen();
  });

  it('closes on Close', () => {
    renderSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
