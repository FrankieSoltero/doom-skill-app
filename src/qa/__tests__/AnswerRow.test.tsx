// An answer's row and its controls (src/qa/AnswerRow.tsx, src/qa/useQaAction.ts; M10 plan Q
// Task 12, spec 3.4, decisions Q13 and Q16), over the real API client, a fake network and Jest's
// fake clock: who may accept, mark helpful, flag and delete, the request each control sends, the
// two-tap delete and its reset, the disabled states and the lines a refused action shows.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { advance } from '../../components/testing/screen';
import type { Answer, Question } from '../../data/qa';
import * as log from '../../log';
import { AnswerRow } from '../AnswerRow';
import { INBOX_KEY } from '../useInbox';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WHEN = '2026-10-05T09:30:00Z';
const A_ID = uuid(10);
const Q_ID = uuid(1);
const CARD_KEY = ['cardQuestions', uuid(81)];

const ANSWER: Answer = {
  id: A_ID,
  text: 'Stack them.',
  status: 'visible',
  createdAt: WHEN,
  author: { name: 'lin', level: 1 },
  mine: false,
  helpfulCount: 0,
  helpfulByMe: false,
  accepted: false,
};
const QUESTION: Question = {
  id: Q_ID,
  cardId: uuid(81),
  topicId: uuid(90),
  text: 'How do two patterns play at once?',
  status: 'open',
  createdAt: WHEN,
  author: { name: null, level: 1 },
  mine: true,
  acceptedAnswerId: null,
  answers: [ANSWER],
};

/** The answer as the API serves it after a helpful vote. */
const SERVED_ANSWER = {
  id: A_ID,
  text: 'Stack them.',
  status: 'visible',
  created_at: WHEN,
  author: { name: 'lin', level: 1 },
  mine: false,
  helpful_count: 1,
  helpful_by_me: true,
  accepted: true,
};
/** The question as the API serves it after the accept. */
const SERVED_QUESTION = {
  id: Q_ID,
  card_id: uuid(81),
  topic_id: uuid(90),
  text: 'How do two patterns play at once?',
  status: 'answered',
  created_at: WHEN,
  author: { name: null, level: 1 },
  mine: true,
  accepted_answer_id: A_ID,
  answers: [SERVED_ANSWER],
};
const NO_CONTENT = () => new Response(null, { status: 204 });

const ACCEPT = `POST /questions/${Q_ID}/accept`;
const HELPFUL = `POST /answers/${A_ID}/helpful`;
const FLAG = `POST /answers/${A_ID}/flag`;
const DELETE = `DELETE /answers/${A_ID}`;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Renders the row for `answer` and `question` (each over the defaults), with stale-able keys. */
async function renderRow(answer: Partial<Answer> = {}, question: Partial<Question> = {}) {
  const { client, wrapper: Cache } = queryWrapper();
  client.setQueryData(INBOX_KEY, { toAnswer: [], answered: [], badge: 0 });
  client.setQueryData(CARD_KEY, []);
  render(
    <Cache>
      <AnswerRow answer={{ ...ANSWER, ...answer }} question={{ ...QUESTION, ...question }} />
    </Cache>,
  );
  await advance(0);
  return client;
}

const button = (name: string) => screen.getByRole('button', { name });
const noButton = (name: string) => screen.queryByRole('button', { name });
const sent = (requests: { method: string; path: string; body: unknown }[], route: string) =>
  requests.filter((r) => `${r.method} ${r.path}` === route).map((r) => r.body);

/** Presses the control named `name` and lets its request answer. */
async function press(name: string) {
  fireEvent.press(button(name));
  await advance(0);
}

describe('AnswerRow: the answer', () => {
  it('shows the author and the text', async () => {
    await renderRow();

    expect(screen.getByText('lin')).toBeOnTheScreen();
    expect(screen.getByText('Stack them.')).toBeOnTheScreen();
    expect(screen.queryByText('Hidden pending review')).toBeNull();
  });

  it('names the learner’s own answer You and shows the hidden line on it', async () => {
    await renderRow({ mine: true, status: 'hidden', author: { name: null, level: 1 } });

    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getByText('Hidden pending review')).toBeOnTheScreen();
  });

  it('shows the helpful count from 1, and the Accepted label on the accepted answer', async () => {
    await renderRow({ helpfulCount: 3, accepted: true });

    expect(screen.getByText('3 found this helpful')).toBeOnTheScreen();
    expect(screen.getByText('Accepted')).toBeOnTheScreen();
  });

  it('shows no count at 0 and no Accepted label on an answer not accepted', async () => {
    await renderRow();

    expect(screen.queryByText(/found this helpful/)).toBeNull();
    expect(screen.queryByText('Accepted')).toBeNull();
  });
});

describe('AnswerRow: Accept', () => {
  it('accepts the answer on the learner’s own question and marks both lists stale', async () => {
    const requests = serveApi({ [ACCEPT]: [json(200, SERVED_QUESTION)] });
    const client = await renderRow();

    await press('Accept');

    expect(sent(requests, ACCEPT)).toStrictEqual([{ answer_id: A_ID }]);
    expect(client.getQueryState(INBOX_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(CARD_KEY)?.isInvalidated).toBe(true);
  });

  it.each([
    ['another learner’s question', {}, { mine: false }],
    ['a question with an accepted answer', {}, { acceptedAnswerId: uuid(11) }],
    ['the learner’s own answer', { mine: true }, {}],
    ['the learner’s hidden question', {}, { status: 'hidden' as const }],
    ['an answered question served with no accepted answer', {}, { status: 'answered' as const }],
  ])('is not shown on %s', async (_, answer, question) => {
    await renderRow(answer, question);

    expect(noButton('Accept')).toBeNull();
  });

  it('is disabled while the accept is sent', async () => {
    serveApi({ [ACCEPT]: [new Promise<Response>(() => undefined)] });
    await renderRow();

    await press('Accept');

    expect(button('Accept')).toBeDisabled();
  });
});

describe('AnswerRow: Helpful', () => {
  it('marks another learner’s answer helpful and marks both lists stale', async () => {
    const requests = serveApi({ [HELPFUL]: [json(200, SERVED_ANSWER)] });
    const client = await renderRow({}, { mine: false });

    await press('Helpful');

    expect(sent(requests, HELPFUL)).toStrictEqual([null]);
    expect(client.getQueryState(INBOX_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(CARD_KEY)?.isInvalidated).toBe(true);
  });

  it('is disabled once the learner found it helpful', async () => {
    await renderRow({ helpfulByMe: true });

    expect(button('Helpful')).toBeDisabled();
  });

  it('is enabled before the learner voted', async () => {
    await renderRow();

    expect(button('Helpful')).toBeEnabled();
  });

  it('is not shown on the learner’s own answer', async () => {
    await renderRow({ mine: true });

    expect(noButton('Helpful')).toBeNull();
    expect(noButton('Flag')).toBeNull();
  });
});

describe('AnswerRow: Flag', () => {
  it('flags the answer with the reason other in one tap, then shows Flagged', async () => {
    const requests = serveApi({ [FLAG]: [NO_CONTENT()] });
    await renderRow();

    await press('Flag');

    expect(sent(requests, FLAG)).toStrictEqual([{ reason: 'other' }]);
    expect(noButton('Flag')).toBeNull();
    expect(screen.getByText('Flagged')).toBeOnTheScreen();
  });
});

describe('AnswerRow: Delete', () => {
  it('is shown on the learner’s own answer only', async () => {
    await renderRow();

    expect(noButton('Delete')).toBeNull();
  });

  it('asks for a second tap, then deletes the answer', async () => {
    const requests = serveApi({ [DELETE]: [NO_CONTENT()] });
    const client = await renderRow({ mine: true });

    await press('Delete');
    expect(sent(requests, DELETE)).toStrictEqual([]);
    expect(noButton('Delete')).toBeNull();

    await press('Delete? Tap again');
    expect(sent(requests, DELETE)).toHaveLength(1);
    expect(client.getQueryState(INBOX_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(CARD_KEY)?.isInvalidated).toBe(true);
  });

  it('goes back to Delete 5 s after the first tap, and a tap then sends nothing', async () => {
    const requests = serveApi({ [DELETE]: [NO_CONTENT()] });
    await renderRow({ mine: true });

    await press('Delete');
    await advance(4999);
    expect(button('Delete? Tap again')).toBeOnTheScreen();
    await advance(1);
    expect(button('Delete')).toBeOnTheScreen();

    await press('Delete');
    expect(sent(requests, DELETE)).toStrictEqual([]);
    expect(button('Delete? Tap again')).toBeOnTheScreen();
  });
});

describe('AnswerRow: a refused action', () => {
  it.each([
    [403, 'unauthorized', "You can't do that here."],
    [409, 'conflict', 'Already done.'],
    [404, 'notFound', "Couldn't send. Try again."],
    [500, 'server', "Couldn't send. Try again."],
  ])('on a %d, shows its line, logs the kind and sends once', async (status, kind, line) => {
    const warn = jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    const requests = serveApi({ [ACCEPT]: [json(status, { detail: 'refused' })] });
    const client = await renderRow();

    await press('Accept');

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith('qa_action_failed', { kind });
    expect(sent(requests, ACCEPT)).toHaveLength(1);
    expect(client.getQueryState(INBOX_KEY)?.isInvalidated).toBe(false);
    expect(button('Accept')).toBeEnabled();
  });

  it('shows the could-not-send line when the network fails, and keeps Flag', async () => {
    jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    serveApi({ [FLAG]: [new TypeError('Network request failed')] });
    await renderRow();

    await press('Flag');

    expect(screen.getByText("Couldn't send. Try again.")).toBeOnTheScreen();
    expect(button('Flag')).toBeOnTheScreen();
    expect(screen.queryByText('Flagged')).toBeNull();
  });
});
