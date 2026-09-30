// The card source over the API (src/data/apiSource.ts). The API client is the real one over a
// fake network: every request is answered by the test, and none leaves it. The answers are the
// saved `GET /feed/today` response of M3 Task 13 (`__fixtures__/feed_response.json`).
import { renderHook } from '@testing-library/react-native';

import { useFeedStore } from '../../feed/store';
import { useFeedSession } from '../../feed/useFeedSession';
import { logWarning } from '../../log';
import response from '../__fixtures__/feed_response.json';
import { createApiSource } from '../apiSource';
import { mapFeed } from '../mapFeed';
import { feedSetSchema } from '../schema';
import { FeedLoadError } from '../source';
import { json, network, type Answer } from '../testing/network';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const TOPIC = 'strudel';
const TODAY = `/feed/today?topic=${TOPIC}`;
const NEXT = `/feed/next?topic=${TOPIC}`;

const ok = (setNumber = 1, feedDate = response.feed_date) =>
  json(200, { ...response, set_number: setNumber, feed_date: feedDate });
const noContent = () => new Response(null, { status: 204 });
const failed = (status: number) => json(status, { detail: 'x' });

/** An API source for `topic` over a network that gives `answers`. */
function sourceOver(answers: Answer[], topic: () => string | null = () => TOPIC) {
  const { api, requests } = network(...answers);
  return { source: createApiSource(api, topic), requests };
}

/** The rejection of `promise`, which must be a FeedLoadError. */
async function loadErrorOf(promise: Promise<unknown>): Promise<FeedLoadError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof FeedLoadError)) throw new Error('expected a FeedLoadError');
  return error;
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('createApiSource: which set it asks for', () => {
  it("asks for today's set first and serves the saved response, ids included", async () => {
    const { source, requests } = sourceOver([ok()]);

    const set = await source.getNextSet();

    expect(requests).toStrictEqual([TODAY]);
    expect(set).toStrictEqual(feedSetSchema.parse(mapFeed(response)));
    expect(set?.cards.map((card) => card.id)).toStrictEqual(response.cards.map((card) => card.id));
  });

  it('asks for the next set on every later call', async () => {
    const { source, requests } = sourceOver([ok(1), ok(2), ok(3)]);

    const numbers = [];
    for (let call = 0; call < 3; call += 1) numbers.push((await source.getNextSet())?.setNumber);

    expect(requests).toStrictEqual([TODAY, NEXT, NEXT]);
    expect(numbers).toStrictEqual([1, 2, 3]);
  });

  it('answers null for a 204, from today or from next', async () => {
    const empty = sourceOver([noContent(), ok(1), noContent()]);

    expect(await empty.source.getNextSet()).toBeNull();
    expect((await empty.source.getNextSet())?.setNumber).toBe(1);
    expect(await empty.source.getNextSet()).toBeNull();
    expect(empty.requests).toStrictEqual([TODAY, TODAY, NEXT]);
  });

  it('serves the current set again from today when next answers 409 (set unfinished)', async () => {
    const { source, requests } = sourceOver([ok(1), failed(409), ok(1)]);
    await source.getNextSet();

    const again = await source.getNextSet();

    expect(requests).toStrictEqual([TODAY, NEXT, TODAY]);
    expect(again?.setNumber).toBe(1);
  });

  it('fails with the kind of any other error from next, and asks for next again on retry', async () => {
    const { source, requests } = sourceOver([ok(1), failed(500), ok(2)]);
    await source.getNextSet();

    expect((await loadErrorOf(source.getNextSet())).kind).toBe('server');
    expect((await source.getNextSet())?.setNumber).toBe(2);
    expect(requests).toStrictEqual([TODAY, NEXT, NEXT]);
  });

  it('asks for today again after a failed first load, not for next', async () => {
    const { source, requests } = sourceOver([failed(500), ok(1)]);
    await loadErrorOf(source.getNextSet());

    expect((await source.getNextSet())?.setNumber).toBe(1);
    expect(requests).toStrictEqual([TODAY, TODAY]);
  });

  it("asks for today's set of a new topic when the active topic changes", async () => {
    let topic = TOPIC;
    const { source, requests } = sourceOver([ok(1), ok(1)], () => topic);
    await source.getNextSet();

    topic = 'piano';
    await source.getNextSet();

    expect(requests).toStrictEqual([TODAY, '/feed/today?topic=piano']);
  });
});

describe('createApiSource: failures', () => {
  it('fails with kind noTopic, asking nothing, when there is no active topic', async () => {
    const { source, requests } = sourceOver([], () => null);

    const error = await loadErrorOf(source.getNextSet());

    expect(error.kind).toBe('noTopic');
    expect(requests).toStrictEqual([]);
  });

  it.each([
    { status: 401, kind: 'unauthorized' },
    { status: 404, kind: 'notFound' },
    { status: 422, kind: 'invalid' },
    { status: 429, kind: 'rateLimited' },
    { status: 500, kind: 'server' },
  ])('fails with the kind of an ApiError: $status is $kind', async ({ status, kind }) => {
    const { source } = sourceOver([failed(status)]);

    const error = await loadErrorOf(source.getNextSet());

    expect(error.kind).toBe(kind);
    expect(error.message).toBe(`Feed request failed: ${kind}`);
  });

  it('fails with kind offline when the network never answers, after the retries', async () => {
    const down = new TypeError('Network request failed');
    const { source, requests } = sourceOver([down, down, down]);

    expect((await loadErrorOf(source.getNextSet())).kind).toBe('offline');
    expect(requests).toHaveLength(3);
  });

  it('fails with kind conflict when today itself answers 409', async () => {
    const { source } = sourceOver([failed(409)]);

    expect((await loadErrorOf(source.getNextSet())).kind).toBe('conflict');
  });

  it('fails with kind unknown for an answer that is not JSON, keeping its text out', async () => {
    const garbled = new Response('<html>secret-marker', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const { source } = sourceOver([garbled]);

    const error = await loadErrorOf(source.getNextSet());

    expect(error.kind).toBe('unknown');
    expect(error.message).not.toContain('secret-marker');
  });

  it('fails with kind schema for a set the schema refuses, logging the paths, not the content', async () => {
    const [first, ...rest] = response.cards;
    const { id: _id, ...anonymous } = first ?? {};
    const bad = {
      ...response,
      cards: [{ ...anonymous, title: 42, body: 'secret-marker' }, ...rest],
    };
    const { source } = sourceOver([json(200, bad)]);

    const error = await loadErrorOf(source.getNextSet());

    expect(error.kind).toBe('schema');
    expect(error.message).toBe('Card set failed validation at cards.0.title');
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['feed_invalid', { paths: 'cards.0.title' }],
    ]);
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});

describe('createApiSource: cards it cannot show', () => {
  it('serves the set without them and names their ids', async () => {
    const [first, ...rest] = response.cards;
    const bad = {
      ...response,
      cards: [{ ...first, title: 42 }, { type: 'video', id: 'x' }, ...rest],
    };
    const { source } = sourceOver([json(200, bad)]);

    const set = await source.getNextSet();

    expect(set?.cards.map((card) => card.id)).toStrictEqual(rest.map((card) => card.id));
    expect(set?.droppedIds).toStrictEqual([first?.id]);
  });
});

describe('createApiSource: the current set', () => {
  it('has none before a set is served, and keeps the date and number of the last one', async () => {
    const { source } = sourceOver([ok(1), ok(2), noContent()]);
    expect(source.currentSet()).toBeNull();

    await source.getNextSet();
    expect(source.currentSet()).toStrictEqual({ feedDate: '2026-09-30', setNumber: 1 });
    await source.getNextSet();
    expect(source.currentSet()).toStrictEqual({ feedDate: '2026-09-30', setNumber: 2 });
    await source.getNextSet();
    expect(source.currentSet()).toStrictEqual({ feedDate: '2026-09-30', setNumber: 2 });
  });

  it("names the set by the API's date, not the device's", async () => {
    // The set was stored for 1 October in the user's timezone, whatever the device's date is.
    const { source } = sourceOver([ok(1, '2026-10-01')]);

    const set = await source.getNextSet();

    expect(set?.feedDate).toBe('2026-10-01');
    expect(source.currentSet()).toStrictEqual({ feedDate: '2026-10-01', setNumber: 1 });
  });

  it('fails with kind schema for a set without a date, and keeps no current set', async () => {
    const { feed_date: _dropped, ...undated } = response;
    const { source } = sourceOver([json(200, undated)]);

    const error = await loadErrorOf(source.getNextSet());

    expect(error.kind).toBe('schema');
    expect(error.message).toBe('Card set failed validation at feedDate');
    expect(source.currentSet()).toBeNull();
  });

  it('keeps a set that arrives after the feed screen has gone', async () => {
    useFeedStore.setState(useFeedStore.getInitialState(), true);
    let answer: (value: Response) => void = () => undefined;
    const late = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { source } = sourceOver([late]);
    const { unmount } = renderHook(() => useFeedSession(source));

    unmount();
    answer(ok(1));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(useFeedStore.getState().set?.setNumber).toBe(1);
    expect(source.currentSet()?.setNumber).toBe(1);
  });
});

describe('mapFeed', () => {
  it('turns every object key, at any depth, to camelCase and leaves values as they are', () => {
    expect(mapFeed({ set_number: 1, topic: { horizon_days: 14 }, a_b_c: 'x_y' })).toStrictEqual({
      setNumber: 1,
      topic: { horizonDays: 14 },
      aBC: 'x_y',
    });
  });

  it('keeps arrays as arrays: the ratings pairs and the moved triples stay as sent', () => {
    expect(mapFeed({ ratings: [['Again', '10 min']], moved: [['x_y', 0.5, 1]] })).toStrictEqual({
      ratings: [['Again', '10 min']],
      moved: [['x_y', 0.5, 1]],
    });
  });

  it('maps the objects inside arrays, such as the cards and the rubric rows', () => {
    expect(mapFeed({ cards: [{ est_seconds: 30, rubric: [{ pass_x: 1 }] }] })).toStrictEqual({
      cards: [{ estSeconds: 30, rubric: [{ passX: 1 }] }],
    });
  });

  it.each([null, 3, 'a_b', true])('gives back %p as it is', (value) => {
    expect(mapFeed(value)).toBe(value);
  });
});
