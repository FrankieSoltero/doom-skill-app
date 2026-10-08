// "Ask a question" (M10 plan Q Task 9, spec 3.4; decision Q10): the sheet the help sheet's third
// row opens. A text field and an Ask button, the passages found for an asked question, and the
// card's questions with their answers, over the real API client and a fake network. A refused or
// failed ask leaves one line and keeps the text; the POST is never retried.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { json, queryWrapper, serveApi, type Answer as Reply } from '../../api/testing/fakeApi';
import { logWarning } from '../../log';
import { AskSheet } from '../AskSheet';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CARD_ID = idOf(1);
const LIST = `GET /cards/${CARD_ID}/questions`;
const ASK = `POST /cards/${CARD_ID}/questions`;
const CREATED = '2026-10-07T12:00:00Z';
const SOURCE = { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini', license: 'MIT' };
const ASKED = 'How do two patterns play at once?';

/** A question as the API serves it (`QuestionOut`, decision Q8). */
const question = (n: number, text: string, extra: object = {}) => ({
  id: idOf(n),
  card_id: CARD_ID,
  topic_id: idOf(99),
  text,
  status: 'open',
  created_at: CREATED,
  author: { name: null, level: 1 },
  mine: false,
  accepted_answer_id: null,
  answers: [],
  ...extra,
});

/** An answer as the API serves it (`AnswerOut`). */
const answer = (n: number, text: string, extra: object = {}) => ({
  id: idOf(n),
  text,
  status: 'visible',
  created_at: CREATED,
  author: { name: null, level: 1 },
  mine: false,
  helpful_count: 0,
  helpful_by_me: false,
  accepted: false,
  ...extra,
});

const QUESTIONS = [
  question(10, 'Why does the bracket nest?', {
    author: { name: 'ada', level: 1 },
    answers: [answer(20, 'It groups a step.', { author: { name: 'lin', level: 1 } })],
  }),
  question(11, 'What is a cycle?'),
  question(12, 'Is this mine?', { mine: true, status: 'hidden', author: { name: 'me', level: 1 } }),
];

const onClose = jest.fn<undefined, []>();

beforeEach(() => {
  jest.useFakeTimers();
  onClose.mockClear();
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

/** Serves `routes` and opens the sheet with its questions loaded. */
async function renderSheet(routes: Record<string, Reply[]>) {
  const requests = serveApi(routes);
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <AskSheet cardId={CARD_ID} onClose={onClose} />
    </Cache>,
  );
  await settle();
  return requests;
}

const field = () => screen.getByLabelText('Ask a question');
const askButton = () => screen.getByRole('button', { name: 'Ask' });
const questionBlocks = () => screen.queryAllByTestId('question');

/** Types `text`, presses Ask and lets the answer land. */
async function askWith(text: string): Promise<void> {
  fireEvent.changeText(field(), text);
  fireEvent.press(askButton());
  await settle();
}

describe('AskSheet field and the card questions', () => {
  it('shows a multiline field of at most 300 characters, the Ask button and the title', async () => {
    await renderSheet({ [LIST]: [json(200, { questions: [] })] });
    const sheet = screen.getByTestId('ask-sheet');

    expect(within(sheet).getAllByRole('header')[0]).toHaveTextContent('Ask a question');
    expect(screen.UNSAFE_getByType(TextInput).props).toMatchObject({
      multiline: true,
      maxLength: 300,
      placeholder: 'What are you stuck on?',
    });
    expect(askButton()).toBeDisabled();
  });

  it("shows the card's questions with their authors, the hidden line and the answers", async () => {
    const requests = await renderSheet({ [LIST]: [json(200, { questions: QUESTIONS })] });

    expect(requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([LIST]);
    expect(screen.getByText('Questions on this card')).toBeOnTheScreen();
    const [first, second, third] = questionBlocks();
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('three questions expected');
    }
    expect(within(first).getByText('ada')).toBeOnTheScreen();
    expect(within(first).getByText('Why does the bracket nest?')).toBeOnTheScreen();
    expect(within(first).getByText('lin')).toBeOnTheScreen();
    expect(within(first).getByText('It groups a step.')).toBeOnTheScreen();
    expect(within(second).getByText('A learner')).toBeOnTheScreen();
    expect(within(second).queryByText('Hidden pending review')).toBeNull();
    expect(within(third).getByText('You')).toBeOnTheScreen();
    expect(within(third).queryByText('me')).toBeNull();
    expect(within(third).getByText('Hidden pending review')).toBeOnTheScreen();
    expect(screen.queryByText('No questions yet.')).toBeNull();
  });

  it('says there are no questions yet for a card without any', async () => {
    await renderSheet({ [LIST]: [json(200, { questions: [] })] });

    expect(screen.getByText('No questions yet.')).toBeOnTheScreen();
    expect(questionBlocks()).toHaveLength(0);
  });

  it('shows the loading line while the questions load', async () => {
    await renderSheet({ [LIST]: [new Promise<Response>(() => undefined)] });

    expect(screen.getByText('Loading…')).toBeOnTheScreen();
    expect(screen.queryByText('No questions yet.')).toBeNull();
  });

  it('shows no list and no "no questions" line when the questions fail to load', async () => {
    await renderSheet({ [LIST]: [json(500, { detail: 'boom' })] });

    expect(screen.queryByText('No questions yet.')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(questionBlocks()).toHaveLength(0);
    expect(field()).toBeOnTheScreen();
  });

  it('enables Ask only from 2 characters after trimming', async () => {
    await renderSheet({ [LIST]: [json(200, { questions: [] })] });

    fireEvent.changeText(field(), ' a ');
    expect(askButton()).toBeDisabled();
    fireEvent.changeText(field(), 'ab');
    expect(askButton()).toBeEnabled();
  });

  it('closes on Close', async () => {
    await renderSheet({ [LIST]: [json(200, { questions: [] })] });

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AskSheet after an ask', () => {
  const asked = question(30, ASKED, { mine: true });

  it('sends the text, clears the field, puts the question first and shows the passages', async () => {
    const reply = { question: asked, passages: [{ text: 'Use a comma.', source: SOURCE }] };
    const requests = await renderSheet({
      [LIST]: [
        json(200, { questions: QUESTIONS }),
        json(200, { questions: [asked, ...QUESTIONS] }),
      ],
      [ASK]: [json(201, reply)],
    });

    await askWith(ASKED);

    expect(requests.map((r) => [`${r.method} ${r.path}`, r.body])).toStrictEqual([
      [LIST, null],
      [ASK, { text: ASKED }],
      [LIST, null],
    ]);
    expect(field()).toHaveDisplayValue('');
    expect(questionBlocks()).toHaveLength(4);
    expect(within(questionBlocks()[0] ?? screen.root).getByText(ASKED)).toBeOnTheScreen();
    expect(screen.getByText('From the sources')).toBeOnTheScreen();
    expect(screen.getByTestId('passage-text')).toHaveTextContent('Use a comma.');
    expect(screen.getByRole('link')).toHaveTextContent(/Mini-notation/);
  });

  it('shows no passages section when none were found', async () => {
    await renderSheet({
      [LIST]: [json(200, { questions: [] }), json(200, { questions: [asked] })],
      [ASK]: [json(201, { question: asked, passages: [] })],
    });

    await askWith(ASKED);

    expect(questionBlocks()).toHaveLength(1);
    expect(screen.queryByText('From the sources')).toBeNull();
    expect(screen.queryByText('No questions yet.')).toBeNull();
  });

  it('keeps the asked question when the list read in flight lands after it, and reads again', async () => {
    let landFirstRead: (reply: Response) => void = () => undefined;
    const firstRead = new Promise<Response>((resolve) => {
      landFirstRead = resolve;
    });
    const requests = await renderSheet({
      [LIST]: [firstRead, json(200, { questions: [asked] })],
      [ASK]: [json(201, { question: asked, passages: [] })],
    });

    await askWith(ASKED);
    landFirstRead(json(200, { questions: [] }));
    await settle();

    expect(questionBlocks()).toHaveLength(1);
    expect(within(questionBlocks()[0] ?? screen.root).getByText(ASKED)).toBeOnTheScreen();
    expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
  });

  it('sends one request while an ask is in flight, the button disabled', async () => {
    const requests = await renderSheet({
      [LIST]: [json(200, { questions: [] })],
      [ASK]: [new Promise<Response>(() => undefined)],
    });

    await askWith(ASKED);
    fireEvent.press(askButton());
    await settle();

    expect(askButton()).toBeDisabled();
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });
});

describe('AskSheet on a refused or failed ask', () => {
  it.each<[string, Reply, string]>([
    ['a 429', json(429, { detail: 'Too many requests' }), "You've reached today's limit."],
    ['a 403', json(403, { detail: 'Not allowed' }), "You can't do that here."],
    [
      'a 422',
      json(422, { detail: 'Text not allowed' }),
      'Keep it to plain text, 2–300 characters, no links.',
    ],
    ['a 500', json(500, { detail: 'boom' }), "Couldn't send. Try again."],
    ['a 404', json(404, { detail: 'Not found' }), "Couldn't send. Try again."],
    ['no network', new TypeError('Network request failed'), "Couldn't send. Try again."],
  ])('shows its line on %s and keeps the text, sent once', async (_name, reply, line) => {
    const requests = await renderSheet({
      [LIST]: [json(200, { questions: [] })],
      [ASK]: [reply],
    });

    await askWith(ASKED);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(field()).toHaveDisplayValue(ASKED);
    expect(askButton()).toBeEnabled();
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(questionBlocks()).toHaveLength(0);
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['ask_failed', { kind: expect.any(String) as string }],
    ]);
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain(ASKED);
  });
});
