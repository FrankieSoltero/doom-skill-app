// The Questions tab's lists and the answer composer (app/(tabs)/questions.tsx, M10 plan Q Task 11;
// spec 3.4, D16), over the real API client and a fake network: the two sections, each question
// with its author, date, hidden line and answers, and the composer under each question to answer.
// The focus effect is a no-op here; marking the inbox seen is questions.test.tsx's.
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import * as log from '../../../src/log';
import QuestionsScreen from '../questions';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WHEN = '2026-10-05T09:30:00Z';
const INBOX = 'GET /questions/inbox';

/** An answer as the API serves it, by `n`, with `extra` over the defaults. */
const reply = (n: number, extra: Record<string, unknown>) => ({
  accepted: false,
  helpful_by_me: false,
  helpful_count: 0,
  mine: false,
  author: { name: null, level: 1 },
  created_at: WHEN,
  status: 'visible',
  text: `Answer ${String(n)}`,
  id: uuid(n),
  ...extra,
});

/** A question as the API serves it (decision Q8), by `n`, with `extra` over the defaults. */
const asked = (n: number, extra: Record<string, unknown>) => ({
  answers: [],
  accepted_answer_id: null,
  mine: false,
  author: { name: null, level: 1 },
  created_at: WHEN,
  status: 'open',
  text: `Question ${String(n)}`,
  topic_id: uuid(90),
  card_id: uuid(80 + n),
  id: uuid(n),
  ...extra,
});

const TO_ANSWER = [
  asked(1, { author: { name: 'ada', level: 1 }, text: 'Why does the bracket nest?' }),
  asked(2, { text: 'What is a cycle?' }),
];
const ANSWERED = [
  asked(3, {
    mine: true,
    author: { name: 'me', level: 1 },
    text: 'How do two patterns play at once?',
    answers: [
      reply(10, { author: { name: 'lin', level: 1 }, text: 'Stack them.' }),
      reply(11, { text: 'Use a comma.' }),
    ],
  }),
  asked(4, {
    mine: true,
    status: 'hidden',
    answers: [reply(12, { mine: true, status: 'hidden' })],
  }),
];
const BOTH = { to_answer: TO_ANSWER, answered: ANSWERED, badge: 0 };
const ONLY_TO_ANSWER = { to_answer: TO_ANSWER.slice(0, 1), answered: [], badge: 0 };
const POST_ANSWER = `POST /questions/${uuid(1)}/answers`;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.useFakeTimers();
});

const cards = () => screen.getAllByTestId('inbox-question');
const card = (index: number) => {
  const found = cards()[index];
  if (found === undefined) throw new Error(`no question at ${String(index)}`);
  return within(found);
};
const field = () => screen.getByLabelText('Write an answer');
const answerButton = () => screen.getByRole('button', { name: 'Answer' });
const count = (requests: { method: string; path: string }[], route: string) =>
  requests.filter((r) => `${r.method} ${r.path}` === route).length;

/** Types `text` in the first composer, presses Answer and lets the reply land. */
async function answerWith(text: string) {
  fireEvent.changeText(field(), text);
  fireEvent.press(answerButton());
  await advance(0);
}

describe('Questions: the lists', () => {
  it('shows the questions to answer, then the answers to the learner’s questions', async () => {
    serveApi({ [INBOX]: [json(200, BOTH)] });
    await renderScreen(<QuestionsScreen />);

    expect(screen.getAllByRole('header').map((h) => h.props.children as unknown)).toStrictEqual([
      'Questions',
      'You can answer',
      'Answers to your questions',
    ]);
    expect(cards()).toHaveLength(4);
    expect(card(0).getByText('ada')).toBeOnTheScreen();
    expect(card(0).getByText('Why does the bracket nest?')).toBeOnTheScreen();
    expect(card(0).getByText(new Date(WHEN).toLocaleDateString())).toBeOnTheScreen();
    expect(card(1).getByText('A learner')).toBeOnTheScreen();
    expect(card(2).getByText('You')).toBeOnTheScreen();
    expect(card(2).queryByText('me')).toBeNull();
    expect(card(2).getByText('lin')).toBeOnTheScreen();
    expect(card(2).getByText('Stack them.')).toBeOnTheScreen();
    expect(card(2).getByText('A learner')).toBeOnTheScreen();
    expect(card(2).getByText('Use a comma.')).toBeOnTheScreen();
  });

  it('puts an answer field under each question to answer and none under the answered', async () => {
    serveApi({ [INBOX]: [json(200, BOTH)] });
    await renderScreen(<QuestionsScreen />);

    expect(card(0).getByLabelText('Write an answer')).toBeOnTheScreen();
    expect(card(1).getByLabelText('Write an answer')).toBeOnTheScreen();
    expect(card(2).queryByLabelText('Write an answer')).toBeNull();
    expect(card(3).queryByLabelText('Write an answer')).toBeNull();
  });

  it('shows the hidden line on the learner’s hidden question and hidden answer only', async () => {
    serveApi({ [INBOX]: [json(200, BOTH)] });
    await renderScreen(<QuestionsScreen />);

    expect(card(0).queryByText('Hidden pending review')).toBeNull();
    expect(card(2).queryByText('Hidden pending review')).toBeNull();
    expect(card(3).getAllByText('Hidden pending review')).toHaveLength(2);
    expect(card(3).getAllByText('You')).toHaveLength(2);
  });

  it('leaves out an empty section', async () => {
    serveApi({ [INBOX]: [json(200, ONLY_TO_ANSWER)] });
    await renderScreen(<QuestionsScreen />);

    expect(screen.getByText('You can answer')).toBeOnTheScreen();
    expect(screen.queryByText('Answers to your questions')).toBeNull();
  });

  it('leaves out the section to answer when it is empty', async () => {
    serveApi({ [INBOX]: [json(200, { ...BOTH, to_answer: [] })] });
    await renderScreen(<QuestionsScreen />);

    expect(screen.queryByText('You can answer')).toBeNull();
    expect(screen.getByText('Answers to your questions')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Write an answer')).toBeNull();
  });
});

describe('Questions: the answer composer', () => {
  it('is a multiline field of at most 600 characters; Answer needs 2 characters', async () => {
    serveApi({ [INBOX]: [json(200, ONLY_TO_ANSWER)] });
    await renderScreen(<QuestionsScreen />);

    expect(screen.UNSAFE_getByType(TextInput).props).toMatchObject({
      multiline: true,
      maxLength: 600,
      placeholder: 'Write an answer',
    });
    expect(answerButton()).toBeDisabled();
    fireEvent.changeText(field(), ' a ');
    expect(answerButton()).toBeDisabled();
    fireEvent.changeText(field(), 'ab');
    expect(answerButton()).toBeEnabled();
  });

  it('posts the text, clears the field and reads the inbox and the card questions again', async () => {
    const requests = serveApi({
      [INBOX]: [json(200, ONLY_TO_ANSWER)],
      [POST_ANSWER]: [json(201, TO_ANSWER[0])],
    });
    const client = await renderScreen(<QuestionsScreen />);
    const cardKey = ['cardQuestions', uuid(81)];
    act(() => {
      client.setQueryData(cardKey, []);
    });

    await answerWith('  Brackets make a sub-cycle.  ');

    const answers = requests.filter((r) => `${r.method} ${r.path}` === POST_ANSWER);
    expect(answers.map((r) => r.body)).toStrictEqual([{ text: 'Brackets make a sub-cycle.' }]);
    expect(count(requests, INBOX)).toBe(2);
    expect(client.getQueryState(cardKey)?.isInvalidated).toBe(true);
    expect(field()).toHaveDisplayValue('');
  });

  it('is disabled while the answer is sent', async () => {
    serveApi({
      [INBOX]: [json(200, ONLY_TO_ANSWER)],
      [POST_ANSWER]: [new Promise<Response>(() => undefined)],
    });
    await renderScreen(<QuestionsScreen />);

    await answerWith('Brackets make a sub-cycle.');

    expect(answerButton()).toBeDisabled();
  });

  it.each([
    [429, 'rateLimited', "You've reached today's limit."],
    [403, 'unauthorized', "You can't do that here."],
    [422, 'invalid', 'Keep it to plain text, 2–600 characters, no links.'],
    [500, 'server', "Couldn't send. Try again."],
  ])('on a %d, shows its line, keeps the text and logs the kind', async (status, kind, line) => {
    const warn = jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    const requests = serveApi({
      [INBOX]: [json(200, ONLY_TO_ANSWER)],
      [POST_ANSWER]: [json(status, { detail: 'refused' })],
    });
    await renderScreen(<QuestionsScreen />);

    await answerWith('Brackets make a sub-cycle.');

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(field()).toHaveDisplayValue('Brackets make a sub-cycle.');
    expect(warn).toHaveBeenCalledWith('answer_failed', { kind });
    expect(count(requests, POST_ANSWER)).toBe(1);
    expect(count(requests, INBOX)).toBe(1);
  });

  it('shows the could-not-send line when the network fails', async () => {
    jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    serveApi({
      [INBOX]: [json(200, ONLY_TO_ANSWER)],
      [POST_ANSWER]: [new TypeError('Network request failed')],
    });
    await renderScreen(<QuestionsScreen />);

    await answerWith('Brackets make a sub-cycle.');

    expect(screen.getByText("Couldn't send. Try again.")).toBeOnTheScreen();
    expect(field()).toHaveDisplayValue('Brackets make a sub-cycle.');
  });
});
