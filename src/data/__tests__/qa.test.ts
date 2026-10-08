// The peer questions of a card and the learner's questions inbox (src/data/qa.ts, M10 plan Q
// Task 8), through the real API client over a fake network: each call's method, path and body, the
// reply read in camelCase, a reply the schema refuses, and the outcome each refused POST reads as.
// The replies are the shapes the API builds (plan Q decision Q8).
import * as client from '../../api/client';
import { ApiError } from '../../api/errors';
import { json, serveApi, type Answer as Reply } from '../../api/testing/fakeApi';
import { logWarning } from '../../log';
import { FeedActionError } from '../feedActions';
import { network } from '../testing/network';
import {
  acceptAnswer,
  answerQuestion,
  ask,
  deleteAnswer,
  deleteQuestion,
  fetchInbox,
  flagAnswer,
  flagQuestion,
  listCardQuestions,
  markHelpful,
  markInboxSeen,
  qaOutcome,
  type Answer,
  type AskPassage,
  type AskResult,
  type Author,
  type Inbox,
  type QaFlagReason,
  type QaOutcome,
  type Question,
} from '../qa';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const CARD_ID = '00000000-0000-4000-8000-000000000001';
const QUESTION_ID = '00000000-0000-4000-8000-000000000002';
const ANSWER_ID = '00000000-0000-4000-8000-000000000003';
const TOPIC_ID = '00000000-0000-4000-8000-000000000004';
const CREATED = '2026-10-07T12:00:00Z';
const SOURCE = { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini', license: null };

/** An answer as the API serves it (`AnswerOut`). */
const ANSWER_OUT = {
  id: ANSWER_ID,
  text: 'Use a comma inside the brackets.',
  status: 'visible',
  created_at: CREATED,
  author: { name: 'ada', level: 2 },
  mine: false,
  helpful_count: 2,
  helpful_by_me: true,
  accepted: true,
};

/** A question as the API serves it (`QuestionOut`). */
const QUESTION_OUT = {
  id: QUESTION_ID,
  card_id: CARD_ID,
  topic_id: TOPIC_ID,
  text: 'How do two patterns play at once?',
  status: 'answered',
  created_at: CREATED,
  author: { name: null, level: 1 },
  mine: true,
  accepted_answer_id: ANSWER_ID,
  answers: [ANSWER_OUT],
};

const ADA: Author = { name: 'ada', level: 2 };
const A_LEARNER: Author = { name: null, level: 1 };

/** `ANSWER_OUT` as the app reads it. */
const ANSWER: Answer = {
  id: ANSWER_ID,
  text: 'Use a comma inside the brackets.',
  status: 'visible',
  createdAt: CREATED,
  author: ADA,
  mine: false,
  helpfulCount: 2,
  helpfulByMe: true,
  accepted: true,
};

/** `QUESTION_OUT` as the app reads it. */
const QUESTION: Question = {
  id: QUESTION_ID,
  cardId: CARD_ID,
  topicId: TOPIC_ID,
  text: 'How do two patterns play at once?',
  status: 'answered',
  createdAt: CREATED,
  author: A_LEARNER,
  mine: true,
  acceptedAnswerId: ANSWER_ID,
  answers: [ANSWER],
};

const NO_CONTENT = () => new Response(null, { status: 204 });

/** The app's client over a fake network that answers `routes`, and the requests it was sent. */
function served(routes: Record<string, Reply[]>) {
  const requests = serveApi(routes);
  const api = client.api;
  if (api === null) throw new Error('serveApi gave no client');
  return { api, requests };
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ask', () => {
  it('posts the text and reads the question and its passages', async () => {
    const passage: AskPassage = { text: 'Commas stack patterns.', source: SOURCE };
    const reply = { question: QUESTION_OUT, passages: [passage] };
    const { api, requests } = served({
      [`POST /cards/${CARD_ID}/questions`]: [json(201, reply)],
    });

    const read = await ask(api, CARD_ID, 'How do two patterns play at once?');

    const expected: AskResult = { question: QUESTION, passages: [passage] };
    expect(read).toStrictEqual(expected);
    expect(requests).toStrictEqual([
      {
        method: 'POST',
        path: `/cards/${CARD_ID}/questions`,
        query: '',
        body: { text: 'How do two patterns play at once?' },
      },
    ]);
  });

  it('refuses a passage whose source is not https with FeedActionError schema', async () => {
    const http = { ...SOURCE, url: 'http://strudel.cc/learn/mini' };
    const reply = { question: QUESTION_OUT, passages: [{ text: 'secret-marker', source: http }] };
    const { api } = served({ [`POST /cards/${CARD_ID}/questions`]: [json(201, reply)] });

    const error: unknown = await ask(api, CARD_ID, 'Why?').catch((r: unknown) => r);

    expect(error).toBeInstanceOf(FeedActionError);
    expect(logWarning).toHaveBeenCalledWith('ask_invalid', { paths: 'passages.0.source.url' });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});

describe('listCardQuestions', () => {
  it("reads the card's questions", async () => {
    const { api, requests } = served({
      [`GET /cards/${CARD_ID}/questions`]: [json(200, { questions: [QUESTION_OUT] })],
    });

    await expect(listCardQuestions(api, CARD_ID)).resolves.toStrictEqual([QUESTION]);
    expect(requests).toStrictEqual([
      { method: 'GET', path: `/cards/${CARD_ID}/questions`, query: '', body: null },
    ]);
  });

  it.each([
    [
      'a status the app does not know',
      { ...QUESTION_OUT, status: 'deleted' },
      'questions.0.status',
    ],
    [
      'a hidden-by-type answer status',
      { ...QUESTION_OUT, answers: [{ ...ANSWER_OUT, status: 'gone' }] },
      'questions.0.answers.0.status',
    ],
    ['no author', { ...QUESTION_OUT, author: undefined }, 'questions.0.author'],
    [
      'an author with no level',
      { ...QUESTION_OUT, author: { name: null } },
      'questions.0.author.level',
    ],
    [
      'an author at level 0',
      { ...QUESTION_OUT, author: { name: null, level: 0 } },
      'questions.0.author.level',
    ],
    [
      'an author at level 1.5',
      { ...QUESTION_OUT, author: { name: null, level: 1.5 } },
      'questions.0.author.level',
    ],
  ])('refuses a question with %s with FeedActionError schema', async (_case, question, paths) => {
    const { api } = served({
      [`GET /cards/${CARD_ID}/questions`]: [json(200, { questions: [question] })],
    });

    const error: unknown = await listCardQuestions(api, CARD_ID).catch((r: unknown) => r);

    expect(error).toBeInstanceOf(FeedActionError);
    expect(error).toMatchObject({ kind: 'schema' });
    expect(logWarning).toHaveBeenCalledWith('questions_invalid', { paths });
  });
});

describe('fetchInbox', () => {
  it('reads the questions to answer, the answered ones and the badge', async () => {
    const reply = { to_answer: [QUESTION_OUT], answered: [], badge: 3 };
    const { api, requests } = served({ 'GET /questions/inbox': [json(200, reply)] });

    const inbox: Inbox = { toAnswer: [QUESTION], answered: [], badge: 3 };
    await expect(fetchInbox(api)).resolves.toStrictEqual(inbox);
    expect(requests).toStrictEqual([
      { method: 'GET', path: '/questions/inbox', query: '', body: null },
    ]);
  });

  it('refuses a negative badge with FeedActionError schema', async () => {
    const reply = { to_answer: [], answered: [], badge: -1 };
    const { api } = served({ 'GET /questions/inbox': [json(200, reply)] });

    const error: unknown = await fetchInbox(api).catch((r: unknown) => r);

    expect(error).toBeInstanceOf(FeedActionError);
    expect(logWarning).toHaveBeenCalledWith('inbox_invalid', { paths: 'badge' });
  });

  it("sends the caller's signal with the request", async () => {
    const { api, sent } = network(json(200, { to_answer: [], answered: [], badge: 0 }));
    const controller = new AbortController();

    const pending = fetchInbox(api, controller.signal);
    controller.abort();
    await pending.catch(() => undefined);

    expect(sent[0]?.signal.aborted).toBe(true);
  });
});

describe('the calls with no reply body', () => {
  const reason: QaFlagReason = 'spam';

  it.each([
    ['markInboxSeen', 'POST /questions/inbox/seen', null, (api: Api) => markInboxSeen(api)],
    [
      'flagQuestion',
      `POST /questions/${QUESTION_ID}/flag`,
      { reason },
      (api: Api) => flagQuestion(api, QUESTION_ID, reason),
    ],
    [
      'flagAnswer',
      `POST /answers/${ANSWER_ID}/flag`,
      { reason },
      (api: Api) => flagAnswer(api, ANSWER_ID, reason),
    ],
    [
      'deleteQuestion',
      `DELETE /questions/${QUESTION_ID}`,
      null,
      (api: Api) => deleteQuestion(api, QUESTION_ID),
    ],
    [
      'deleteAnswer',
      `DELETE /answers/${ANSWER_ID}`,
      null,
      (api: Api) => deleteAnswer(api, ANSWER_ID),
    ],
  ])('%s sends %s and resolves to nothing', async (_name, route, body, call) => {
    const { api, requests } = served({ [route]: [NO_CONTENT()] });

    await expect(call(api)).resolves.toBeUndefined();
    const [method, path] = route.split(' ');
    expect(requests).toStrictEqual([{ method, path, query: '', body }]);
  });
});

type Api = NonNullable<typeof client.api>;

describe('the answer calls', () => {
  it('answerQuestion posts the text and reads the question', async () => {
    const route = `POST /questions/${QUESTION_ID}/answers`;
    const { api, requests } = served({ [route]: [json(201, QUESTION_OUT)] });

    await expect(answerQuestion(api, QUESTION_ID, 'Use a comma.')).resolves.toStrictEqual(QUESTION);
    expect(requests).toStrictEqual([
      { method: 'POST', path: route.slice(5), query: '', body: { text: 'Use a comma.' } },
    ]);
  });

  it('acceptAnswer posts the answer id and reads the question', async () => {
    const route = `POST /questions/${QUESTION_ID}/accept`;
    const { api, requests } = served({ [route]: [json(200, QUESTION_OUT)] });

    await expect(acceptAnswer(api, QUESTION_ID, ANSWER_ID)).resolves.toStrictEqual(QUESTION);
    expect(requests).toStrictEqual([
      { method: 'POST', path: route.slice(5), query: '', body: { answer_id: ANSWER_ID } },
    ]);
  });

  it('markHelpful posts nothing and reads the answer', async () => {
    const route = `POST /answers/${ANSWER_ID}/helpful`;
    const { api, requests } = served({ [route]: [json(200, ANSWER_OUT)] });

    await expect(markHelpful(api, ANSWER_ID)).resolves.toStrictEqual(ANSWER);
    expect(requests).toStrictEqual([
      { method: 'POST', path: route.slice(5), query: '', body: null },
    ]);
  });

  it('markHelpful refuses an answer with a negative count with FeedActionError schema', async () => {
    const route = `POST /answers/${ANSWER_ID}/helpful`;
    const { api } = served({ [route]: [json(200, { ...ANSWER_OUT, helpful_count: -1 })] });

    const error: unknown = await markHelpful(api, ANSWER_ID).catch((r: unknown) => r);

    expect(error).toBeInstanceOf(FeedActionError);
    expect(logWarning).toHaveBeenCalledWith('answer_invalid', { paths: 'helpfulCount' });
  });
});

describe('qaOutcome', () => {
  it.each<[number, QaOutcome]>([
    [429, 'rateLimited'],
    [403, 'notAllowed'],
    [422, 'textRefused'],
    [404, 'notFound'],
    [409, 'conflict'],
  ])('reads the ApiError of a refused POST with status %i as %s', async (status, outcome) => {
    const route = `POST /questions/${QUESTION_ID}/answers`;
    const { api, requests } = served({ [route]: [json(status, { detail: 'Refused' })] });

    const error: unknown = await answerQuestion(api, QUESTION_ID, 'Hi.').catch((r: unknown) => r);

    expect(error).toBeInstanceOf(ApiError);
    expect(qaOutcome(error)).toBe(outcome);
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['a 500', new ApiError('server', 500)],
    ['a 400', new ApiError('invalid', 400)],
    ['no network', new ApiError('offline', 0)],
    ['a time-out', new ApiError('timeout', 0)],
    ['a refused reply', new FeedActionError('schema')],
    ['any other error', new Error('boom')],
    ['a value that is not an error', 'boom'],
  ])('gives null for %s, for the caller to re-throw', (_case, error) => {
    expect(qaOutcome(error)).toBeNull();
  });
});
