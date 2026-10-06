// "Show me the source" (M9 plan H Task 5, spec 5.2): the sheet a card's book icon opens. It shows
// the card's links at once and, for a card with a server id, loads the passages of the card's node
// over the real API client and a fake network: the passage the card was built from first, then the
// others, then the links. Any failure leaves the links and one line; a demo card asks nothing.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { colors } from '../../theme';
import { SourceSheet } from '../SourceSheet';
import { SourcesTarget } from '../SourcesButton';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

/** React Native's Jest preset already makes `Linking`'s functions `jest.fn`s. */
const linking = jest.mocked(Linking);

const CARD_ID = '6f1c0a52-3c1e-4c9b-9a39-2f7e8d1b4c11';
const ROUTE = `GET /cards/${CARD_ID}/source`;
const LINK = {
  title: 'Mini-notation',
  url: 'https://strudel.cc/learn/mini-notation/',
  license: 'MIT',
};
const WIKI = { title: 'Polymeter', url: 'https://en.wikipedia.org/wiki/Polymeter', license: null };
const CARD: Card = { ...cardsByType.quiz, id: CARD_ID, sources: [LINK] };

const passage = (text: string, leadIn: string, own: boolean) => ({
  text,
  lead_in: leadIn,
  own,
  source: { ...LINK, license: 'CC BY-SA 4.0' },
});
/** The server's order puts the own passage second: the sheet still shows it first. */
const SOURCE = {
  passages: [
    passage('Another passage.', '', false),
    passage('The own passage.', 'Before it.', true),
  ],
  sources: [LINK, WIKI],
};

beforeEach(() => {
  jest.useFakeTimers();
  linking.openURL.mockReset();
  linking.openURL.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function renderSheet(card: Card, all?: boolean) {
  const { wrapper: Cache } = queryWrapper();
  const extra = all === undefined ? {} : { all };
  render(
    <Cache>
      <SourcesTarget card={card}>
        <SourceSheet cardId={card.id ?? null} {...extra} onClose={jest.fn<undefined, []>()} />
      </SourcesTarget>
    </Cache>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

const sheet = () => screen.getByTestId('sources-sheet');
const headers = () =>
  within(sheet())
    .getAllByRole('header')
    .map((h) => String(h.props.children));
const passageTexts = () =>
  within(sheet())
    .queryAllByTestId('passage-text')
    .map((t) => String(t.props.children));

/** Asserts the card's link row is there and that the sheet holds no passage. */
function expectLinksOnly(): void {
  expect(within(sheet()).getByText('Mini-notation')).toBeOnTheScreen();
  expect(within(sheet()).getByText('Licence: MIT')).toBeOnTheScreen();
  expect(passageTexts()).toStrictEqual([]);
  expect(screen.queryByText('Finding the passage…')).toBeNull();
}

describe('SourceSheet', () => {
  it('shows the links and the loading line at once, under the sheet title', () => {
    serveApi({ [ROUTE]: [new Promise<Response>(() => undefined)] });
    renderSheet(CARD);

    expect(headers()).toStrictEqual(['Where this card comes from', 'Sources']);
    expect(within(sheet()).getByText('Finding the passage…')).toBeOnTheScreen();
    expect(within(sheet()).getByText('Mini-notation')).toBeOnTheScreen();
  });

  it('shows the own passage first, then the others, then the links', async () => {
    const requests = serveApi({ [ROUTE]: [json(200, SOURCE)] });
    renderSheet(CARD);
    await settle();

    expect(requests.map((r) => r.query)).toStrictEqual(['']);
    expect(headers()).toStrictEqual([
      'Where this card comes from',
      'This card was built from',
      'More from this idea',
      'Sources',
    ]);
    expect(passageTexts()).toStrictEqual(['The own passage.', 'Another passage.']);
    expect(screen.queryByText('Finding the passage…')).toBeNull();
    expect(screen.queryByText('The passage is not available right now.')).toBeNull();
  });

  it('draws the lead-in muted above the passage, and labels the passage as one element', async () => {
    serveApi({ [ROUTE]: [json(200, SOURCE)] });
    renderSheet(CARD);
    await settle();

    expect(screen.getByText('Before it.')).toHaveStyle({ color: colors.ink, opacity: 0.6 });
    const [own, other] = screen.getAllByTestId('source-passage');
    expect(own?.props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Before it. The own passage.',
    });
    expect(other?.props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Another passage.',
    });
  });

  it("opens a passage's source through its title and licence line", async () => {
    serveApi({ [ROUTE]: [json(200, SOURCE)] });
    renderSheet(CARD);
    await settle();

    const links = screen.getAllByRole('link', { name: 'Open the source' });
    expect(links).toHaveLength(2);
    const [first] = screen.getAllByText('Mini-notation · CC BY-SA 4.0');
    if (first === undefined) throw new Error('no source line');
    fireEvent.press(first);

    expect(linking.openURL.mock.calls).toStrictEqual([[LINK.url]]);
  });

  it.each<[string, Answer]>([
    ['a 404 from an older server', json(404, { detail: 'Not Found' })],
    ['a 500', json(500, { detail: 'boom' })],
    ['an answer the schema refuses', json(200, { passages: [{ text: '' }], sources: [] })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a network failure', new TypeError('Network request failed')],
  ])('shows the links and one line on %s, with no retry button', async (_name, answer) => {
    serveApi({ [ROUTE]: [answer] });
    renderSheet(CARD);
    await settle();

    expect(within(sheet()).getByText('The passage is not available right now.')).toBeOnTheScreen();
    expectLinksOnly();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows a demo card (no id) its links only and asks nothing', async () => {
    const requests = serveApi({});
    renderSheet({ ...cardsByType.quiz, sources: [LINK] });
    await settle();

    expectLinksOnly();
    expect(screen.queryByText('The passage is not available right now.')).toBeNull();
    expect(requests).toStrictEqual([]);
  });

  it('asks for every passage with all=true when opened with `all`', async () => {
    const requests = serveApi({ [ROUTE]: [json(200, SOURCE)] });
    renderSheet(CARD, true);
    await settle();

    expect(requests.map((r) => r.query)).toStrictEqual(['?all=true']);
  });
});
