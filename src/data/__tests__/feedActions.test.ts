// A card's passages and the cards the learner adds to the running set (src/data/feedActions.ts):
// `GET /cards/{id}/source` and `POST /feed/extra`, through the real API client over a fake
// network. The answers are the shapes the API builds (M9 plan G Tasks 2 and 3).
import { ApiError } from '../../api/errors';
import { logWarning } from '../../log';
import response from '../__fixtures__/feed_response.json';
import {
  addExtra,
  cardSourceSchema,
  fetchCardSource,
  FeedActionError,
  passageSchema,
} from '../feedActions';
import { mapFeed } from '../mapFeed';
import { cardSchema } from '../schema';
import { json, network } from '../testing/network';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const CARD_ID = '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f';
const SET = { feedDate: '2026-10-05', setNumber: 2 };

const WIKI = { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini', license: 'AGPL-3.0' };

/** A passage as the API serves it. */
const passage = (text: string, own: boolean, source: object = WIKI) => ({
  kind: 'example',
  text,
  lead_in: 'Before it.',
  own,
  source,
});

const SOURCE = {
  passages: [passage('The own passage.', true), passage('A second one.', false)],
  sources: [{ ...WIKI, license: null }],
};

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('fetchCardSource', () => {
  it("asks for the card's passages and reads them in the server's order, own first", async () => {
    const { api, requests, sent } = network(json(200, SOURCE));

    const read = await fetchCardSource(api, CARD_ID);

    expect(requests).toStrictEqual([`/cards/${CARD_ID}/source`]);
    expect(sent[0]?.method).toBe('GET');
    expect(read).toStrictEqual({
      passages: [
        { text: 'The own passage.', leadIn: 'Before it.', own: true, source: WIKI },
        { text: 'A second one.', leadIn: 'Before it.', own: false, source: WIKI },
      ],
      sources: [{ ...WIKI, license: null }],
    });
  });

  it('asks for all the passages with ?all=true', async () => {
    const { api, requests } = network(json(200, SOURCE));

    await fetchCardSource(api, CARD_ID, true);

    expect(requests).toStrictEqual([`/cards/${CARD_ID}/source?all=true`]);
  });

  it("reads a passage whose source has no licence, as the API's CardSource allows", async () => {
    const bare = { passages: [passage('Text.', true, { ...WIKI, license: null })], sources: [] };
    const { api } = network(json(200, bare));

    const read = await fetchCardSource(api, CARD_ID);

    expect(read.passages[0]?.source.license).toBeNull();
  });

  it.each(['http://strudel.cc/learn/mini', 'not a url'])(
    'refuses a passage whose url is %j with FeedActionError schema, logging the paths only',
    async (url) => {
      const bad = { ...SOURCE, passages: [passage('secret-marker', true, { ...WIKI, url })] };
      const { api } = network(json(200, bad));

      const error: unknown = await fetchCardSource(api, CARD_ID).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(FeedActionError);
      expect(error).toMatchObject({ kind: 'schema' });
      expect(logWarning).toHaveBeenCalledWith('card_source_invalid', {
        paths: 'passages.0.source.url',
      });
      expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
    },
  );

  it("rethrows the client's ApiError for a failed request", async () => {
    const { api } = network(json(404, { detail: 'Not found' }));

    const error: unknown = await fetchCardSource(api, CARD_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'notFound' });
  });
});

describe('the passage schemas', () => {
  const read = { text: 'Text.', leadIn: '', own: false, source: WIKI };

  it('reads a passage with an empty lead-in and drops the kind', () => {
    expect(passageSchema.parse({ ...read, kind: 'statement' })).toStrictEqual(read);
  });

  it('refuses a passage with no text', () => {
    expect(passageSchema.safeParse({ ...read, text: '' }).success).toBe(false);
  });

  it("refuses a node source that is not https, as a card's sources are", () => {
    const http = { ...WIKI, url: 'http://strudel.cc/learn/mini' };
    expect(cardSourceSchema.safeParse({ passages: [], sources: [http] }).success).toBe(false);
  });
});

const choice = { options: ['One', 'Two'], correct: 1, explanation: 'Because **two**.' };
const served = {
  id: CARD_ID,
  node: 'Speed',
  est_seconds: 30,
  points: 5,
  sources: [],
  title: 'Pick one',
};

/** A card of each of the eight types the server can add, in the shape the feed serves. */
const ADDED = [
  ...response.cards.filter((card) => card.type !== 'checkpoint'),
  { ...served, ...choice, type: 'cloze', text: 'A ___ fills the gap.' },
  { ...served, ...choice, type: 'scenario', situation: 'A learner tries it.' },
  { ...served, ...choice, type: 'numeric', problem: 'What is 54 / 3.6?' },
];

describe('addExtra', () => {
  it('serves a card of each of the eight types', () => {
    expect(new Set(ADDED.map((card) => card.type)).size).toBe(8);
  });

  it.each(ADDED.map((card) => [card.type, card] as const))(
    'posts the action and the set, and reads a 200 as an added %s card',
    async (_type, card) => {
      const { api, requests, sent } = network(json(200, { card, added: 1 }));

      const outcome = await addExtra(api, CARD_ID, 'deeper', SET);

      expect(requests).toStrictEqual(['/feed/extra']);
      expect(sent[0]?.method).toBe('POST');
      expect(JSON.parse((await sent[0]?.text()) ?? '')).toStrictEqual({
        card_id: CARD_ID,
        action: 'deeper',
        feed_date: '2026-10-05',
        set_number: 2,
      });
      expect(outcome).toStrictEqual({
        kind: 'added',
        card: cardSchema.parse(mapFeed(card)),
        added: 1,
      });
    },
  );

  it('refuses an added card the schema refuses with FeedActionError schema', async () => {
    const card = { ...served, ...choice, type: 'cloze', text: '' };
    const { api } = network(json(200, { card, added: 1 }));

    const error: unknown = await addExtra(api, CARD_ID, 'test', SET).catch((r: unknown) => r);

    expect(error).toBeInstanceOf(FeedActionError);
    expect(logWarning).toHaveBeenCalledWith('extra_invalid', { paths: 'card.text' });
  });

  it.each([
    ['204', 'nothing', new Response(null, { status: 204 })],
    ['429', 'full', json(429, { detail: 'Too many added cards' })],
    ['404', 'notInFeed', json(404, { detail: 'Not found' })],
    ['409', 'notInFeed', json(409, { detail: 'Not in feed' })],
  ])('reads a %s as %s, after one request', async (_status, kind, answer) => {
    const { api, requests } = network(answer);

    await expect(addExtra(api, CARD_ID, 'test', SET)).resolves.toStrictEqual({ kind });
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['a 500', 'server', json(500, {})],
    ['no network', 'offline', new TypeError('Network request failed')],
  ])("throws the client's ApiError for %s (%s), never sent twice", async (_case, kind, answer) => {
    const { api, requests } = network(answer);

    const error: unknown = await addExtra(api, CARD_ID, 'test', SET).catch((r: unknown) => r);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind });
    expect(requests).toHaveLength(1);
  });

  it("throws the client's timeout ApiError when no answer comes in time", async () => {
    jest.useFakeTimers();
    let fail: (reason: unknown) => void = () => undefined;
    const hang = new Promise<Response>((_resolve, reject) => {
      fail = reject;
    });
    const { api, sent } = network(hang);

    const pending = addExtra(api, CARD_ID, 'test', SET).catch((r: unknown) => r);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(sent[0]?.signal.aborted).toBe(true);
    fail(new DOMException('Aborted', 'AbortError'));

    await expect(pending).resolves.toMatchObject({ name: 'ApiError', kind: 'timeout' });
  });
});
