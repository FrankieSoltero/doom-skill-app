// The controls on the Questions tab's questions and answers (app/(tabs)/questions.tsx, M10 plan Q
// Task 12; spec 3.4, decisions Q13 and Q16), over the real API client and a fake network: every
// answer drawn as its row of controls, accepting an answer to the learner's own question, the
// question's own two-tap Delete and its Flag, and the inbox read again after each action.
// The focus effect is a no-op here; marking the inbox seen is questions.test.tsx's.
import { fireEvent, screen, within } from '@testing-library/react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import * as log from '../../../src/log';
import QuestionsScreen from '../questions';

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INBOX = 'GET /questions/inbox';

/** What a question and an answer share as the API serves them. */
const item = (n: number, extra: object) => ({
  id: uuid(n),
  text: `Item ${String(n)}`,
  author: { name: null },
  created_at: '2026-10-05T09:30:00Z',
  status: 'visible',
  ...extra,
});
/** Another learner's answer, by `n`. */
const theirs = (n: number, extra: object = {}) =>
  item(n, { mine: false, helpful_count: 0, helpful_by_me: false, accepted: false, ...extra });
/** A question (decision Q8), by `n`. */
const question = (n: number, extra: object) =>
  item(n, {
    status: 'open',
    card_id: uuid(80 + n),
    topic_id: uuid(90),
    mine: false,
    accepted_answer_id: null,
    answers: [],
    ...extra,
  });

const MINE = question(3, { mine: true, answers: [theirs(10), theirs(11)] });
const MINE_ACCEPTED = question(3, {
  mine: true,
  status: 'answered',
  accepted_answer_id: uuid(10),
  answers: [theirs(10, { accepted: true }), theirs(11)],
});
const THEIRS = question(1, {});
const inbox = (toAnswer: object[], answered: object[]) => ({
  to_answer: toAnswer,
  answered,
  badge: 0,
});
const NO_CONTENT = () => new Response(null, { status: 204 });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const cards = () => screen.queryAllByTestId('inbox-question');
const card = (index: number) => {
  const found = cards()[index];
  if (found === undefined) throw new Error(`no question at ${String(index)}`);
  return within(found);
};
const sent = (requests: { method: string; path: string; body: unknown }[], route: string) =>
  requests.filter((r) => `${r.method} ${r.path}` === route).map((r) => r.body);

/** Presses the button named `name` in the card at `index` and lets its request answer. */
async function press(index: number, name: string) {
  fireEvent.press(card(index).getByRole('button', { name }));
  await advance(0);
}

describe('Questions: the answer controls', () => {
  it('draws each answer to the learner’s question with Accept, Helpful and Flag', async () => {
    serveApi({ [INBOX]: [json(200, inbox([], [MINE]))] });
    await renderScreen(<QuestionsScreen />);

    expect(card(0).getAllByRole('button', { name: 'Accept' })).toHaveLength(2);
    expect(card(0).getAllByRole('button', { name: 'Helpful' })).toHaveLength(2);
    expect(card(0).getAllByRole('button', { name: 'Flag' })).toHaveLength(2);
  });

  it('accepts an answer, reads the inbox again and shows it Accepted', async () => {
    const accept = `POST /questions/${uuid(3)}/accept`;
    const requests = serveApi({
      [INBOX]: [json(200, inbox([], [MINE])), json(200, inbox([], [MINE_ACCEPTED]))],
      [accept]: [json(200, MINE_ACCEPTED)],
    });
    await renderScreen(<QuestionsScreen />);

    const [first] = card(0).getAllByRole('button', { name: 'Accept' });
    if (first === undefined) throw new Error('no Accept');
    fireEvent.press(first);
    await advance(0);

    expect(sent(requests, accept)).toStrictEqual([{ answer_id: uuid(10) }]);
    expect(sent(requests, INBOX)).toHaveLength(2);
    expect(card(0).getByText('Accepted')).toBeOnTheScreen();
    expect(card(0).queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});

describe('Questions: the question’s controls', () => {
  it('gives the learner’s own question Delete and no Flag, another’s Flag and no Delete', async () => {
    serveApi({ [INBOX]: [json(200, inbox([THEIRS], [question(4, { mine: true })]))] });
    await renderScreen(<QuestionsScreen />);

    expect(card(0).getByRole('button', { name: 'Flag' })).toBeOnTheScreen();
    expect(card(0).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(card(1).getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
    expect(card(1).queryByRole('button', { name: 'Flag' })).toBeNull();
  });

  it('deletes the learner’s own question in two taps and reads the inbox again', async () => {
    const remove = `DELETE /questions/${uuid(3)}`;
    const requests = serveApi({
      [INBOX]: [json(200, inbox([], [MINE])), json(200, inbox([], []))],
      [remove]: [NO_CONTENT()],
    });
    await renderScreen(<QuestionsScreen />);

    await press(0, 'Delete');
    expect(sent(requests, remove)).toStrictEqual([]);
    await press(0, 'Delete? Tap again');

    expect(sent(requests, remove)).toHaveLength(1);
    expect(sent(requests, INBOX)).toHaveLength(2);
    expect(cards()).toHaveLength(0);
  });

  it('goes back to Delete 5 s after the first tap', async () => {
    const requests = serveApi({ [INBOX]: [json(200, inbox([], [MINE]))] });
    await renderScreen(<QuestionsScreen />);

    await press(0, 'Delete');
    await advance(4999);
    expect(card(0).getByRole('button', { name: 'Delete? Tap again' })).toBeOnTheScreen();
    await advance(1);

    await press(0, 'Delete');
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
  });

  it('flags another learner’s question with the reason other, then shows Flagged', async () => {
    const flag = `POST /questions/${uuid(1)}/flag`;
    const requests = serveApi({
      [INBOX]: [json(200, inbox([THEIRS], []))],
      [flag]: [NO_CONTENT()],
    });
    await renderScreen(<QuestionsScreen />);

    await press(0, 'Flag');

    expect(sent(requests, flag)).toStrictEqual([{ reason: 'other' }]);
    expect(card(0).getByText('Flagged')).toBeOnTheScreen();
    expect(card(0).queryByRole('button', { name: 'Flag' })).toBeNull();
  });

  it('shows the refused delete’s line under the question and keeps it', async () => {
    jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    const remove = `DELETE /questions/${uuid(3)}`;
    serveApi({
      [INBOX]: [json(200, inbox([], [MINE]))],
      [remove]: [json(403, { detail: 'Not allowed' })],
    });
    await renderScreen(<QuestionsScreen />);

    await press(0, 'Delete');
    await press(0, 'Delete? Tap again');

    expect(card(0).getByText("You can't do that here.")).toBeOnTheScreen();
    expect(card(0).getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
  });
});
