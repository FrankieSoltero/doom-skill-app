// The placement quiz (src/data/apiSource.ts: `fetchPlacement`, `sendPlacement`,
// `resetPlacement`), through the real API client over a fake network. The answers are the shapes
// the API builds (M8 Task 5): never an answer index on a card.
import { logWarning } from '../../log';
import { fetchPlacement, resetPlacement, sendPlacement } from '../apiSource';
import { FeedLoadError } from '../source';
import { json, network } from '../testing/network';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const QUIZ_ID = '00000000-0000-4000-8000-000000000501';
const PREDICT_ID = '00000000-0000-4000-8000-000000000502';

const QUIZ = {
  bands: [
    { milestone: 1, title: 'First sounds' },
    { milestone: 2, title: 'Mini-notation' },
  ],
  cards: [
    {
      id: QUIZ_ID,
      type: 'quiz',
      milestone: 1,
      band_index: 0,
      title: 'Which call plays a sample?',
      prompt: null,
      options: ['s("bd")', 'note("c3")'],
    },
    {
      id: PREDICT_ID,
      type: 'predict',
      milestone: 2,
      band_index: 1,
      title: 'How many steps per cycle?',
      prompt: 's("bd*4")',
      options: ['2', '4', '8'],
    },
  ],
};

const RESULT = { placed: 1, bands: 2, known_nodes: 3, milestone_title: 'Mini-notation' };

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('fetchPlacement', () => {
  it("asks for the topic's set and reads it in the app shape", async () => {
    const { api, requests, sent } = network(json(200, QUIZ));

    const load = await fetchPlacement(api, 'strudel');

    expect(requests).toStrictEqual(['/topics/strudel/placement']);
    expect(sent[0]?.method).toBe('GET');
    expect(load).toStrictEqual({
      kind: 'quiz',
      quiz: {
        bands: QUIZ.bands,
        cards: [
          {
            id: QUIZ_ID,
            type: 'quiz',
            milestone: 1,
            bandIndex: 0,
            title: 'Which call plays a sample?',
            prompt: null,
            options: ['s("bd")', 'note("c3")'],
          },
          {
            id: PREDICT_ID,
            type: 'predict',
            milestone: 2,
            bandIndex: 1,
            title: 'How many steps per cycle?',
            prompt: 's("bd*4")',
            options: ['2', '4', '8'],
          },
        ],
      },
    });
  });

  it('keeps no answer field a card might carry', async () => {
    const [first] = QUIZ.cards;
    const leaky = { ...QUIZ, cards: [{ ...first, correct: 0, explanation: 'Because.' }] };
    const { api } = network(json(200, leaky));

    const load = await fetchPlacement(api, 'strudel');

    if (load.kind !== 'quiz') throw new Error('expected a quiz');
    expect(Object.keys(load.quiz.cards[0] ?? {}).sort()).toStrictEqual(
      ['bandIndex', 'id', 'milestone', 'options', 'prompt', 'title', 'type'].sort(),
    );
  });

  it('reads a 409 as placed already, after one request', async () => {
    const { api, requests } = network(json(409, RESULT));

    await expect(fetchPlacement(api, 'strudel')).resolves.toStrictEqual({ kind: 'placed' });
    expect(requests).toHaveLength(1);
  });

  it('fails with the API error for any other status', async () => {
    const { api } = network(json(404, { detail: 'Not found' }));

    await expect(fetchPlacement(api, 'strudel')).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'notFound',
    });
  });

  it('fails with kind schema for a set the schema refuses, logging the paths only', async () => {
    const [first] = QUIZ.cards;
    const bad = { ...QUIZ, cards: [{ ...first, type: 'exercise', title: 'secret-marker' }] };
    const { api } = network(json(200, bad));

    const error: unknown = await fetchPlacement(api, 'strudel').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(FeedLoadError);
    expect(error).toMatchObject({
      kind: 'schema',
      message: 'Placement failed validation at cards.0.type',
    });
    expect(logWarning).toHaveBeenCalledWith('placement_invalid', { paths: 'cards.0.type' });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });

  it('refuses a predict card without its code', async () => {
    const predict = QUIZ.cards[1];
    const { api } = network(json(200, { ...QUIZ, cards: [{ ...predict, prompt: null }] }));

    await expect(fetchPlacement(api, 'strudel')).rejects.toMatchObject({ kind: 'schema' });
  });
});

describe('sendPlacement', () => {
  it('posts every answer and reads the result in the app shape', async () => {
    const { api, requests, sent } = network(json(200, RESULT));

    const outcome = await sendPlacement(api, 'strudel', {
      answers: [
        { cardId: QUIZ_ID, choice: 0 },
        { cardId: PREDICT_ID, choice: 2 },
      ],
    });

    expect(requests).toStrictEqual(['/topics/strudel/placement']);
    expect(sent[0]?.method).toBe('POST');
    expect(JSON.parse((await sent[0]?.text()) ?? '')).toStrictEqual({
      answers: [
        { card_id: QUIZ_ID, choice: 0 },
        { card_id: PREDICT_ID, choice: 2 },
      ],
    });
    expect(outcome).toStrictEqual({
      kind: 'result',
      result: { placed: 1, bands: 2, knownNodes: 3, milestoneTitle: 'Mini-notation' },
    });
  });

  it('posts a skip', async () => {
    const skipped = { placed: 0, bands: 2, known_nodes: 0, milestone_title: null };
    const { api, sent } = network(json(200, skipped));

    const outcome = await sendPlacement(api, 'strudel', { skip: true });

    expect(JSON.parse((await sent[0]?.text()) ?? '')).toStrictEqual({ skip: true });
    expect(outcome).toStrictEqual({
      kind: 'result',
      result: { placed: 0, bands: 2, knownNodes: 0, milestoneTitle: null },
    });
  });

  it.each([RESULT, { reason: 'attempts' }])('reads a 409 as placed already: %j', async (body) => {
    const { api } = network(json(409, body));

    await expect(sendPlacement(api, 'strudel', { skip: true })).resolves.toStrictEqual({
      kind: 'placed',
    });
  });

  it('fails with the API error for any other status, and never sends it twice', async () => {
    const { api, requests } = network(json(503, { detail: 'Service unavailable' }));

    await expect(sendPlacement(api, 'strudel', { skip: true })).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(requests).toHaveLength(1);
  });

  it('fails with kind schema for a result the schema refuses', async () => {
    const { api } = network(json(200, { ...RESULT, placed: -1 }));

    await expect(sendPlacement(api, 'strudel', { skip: true })).rejects.toMatchObject({
      kind: 'schema',
      message: 'Placement result failed validation at placed',
    });
  });
});

describe('resetPlacement', () => {
  it('posts the reset and reads a 200 as done', async () => {
    const { api, requests, sent } = network(json(200, { removed_nodes: 4 }));

    await expect(resetPlacement(api, 'strudel')).resolves.toBe('reset');
    expect(requests).toStrictEqual(['/topics/strudel/placement/reset']);
    expect(sent[0]?.method).toBe('POST');
  });

  it.each([
    [409, { detail: 'Nothing to reset' }, 'nothing'],
    [429, { detail: 'Too many requests' }, 'limit'],
  ] as const)('reads a %i as %j: %s', async (status, body, outcome) => {
    const { api } = network(json(status, body));

    await expect(resetPlacement(api, 'strudel')).resolves.toBe(outcome);
  });

  it('fails with the API error for any other status', async () => {
    const { api, requests } = network(json(500, {}));

    await expect(resetPlacement(api, 'strudel')).rejects.toMatchObject({ kind: 'server' });
    expect(requests).toHaveLength(1);
  });
});
