// The Questions tab's screen shell (app/(tabs)/questions.tsx), over the real API client and a fake
// network: marking the inbox seen on focus, the loading, empty and error states. The inbox's
// lists are Task 11's.
import { act, screen } from '@testing-library/react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import {
  advance,
  pressRetry,
  renderScreen,
  SCREEN_TOP_INSET,
} from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import * as log from '../../../src/log';
import { INBOX_KEY } from '../../../src/qa/useInbox';
import { colors } from '../../../src/theme';
import {
  useFocusEffect as mockUseFocusEffect,
  setFocused,
} from '../../../src/topics/testing/focus';
import QuestionsScreen from '../questions';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const EMPTY = { to_answer: [], answered: [], badge: 0 };
const QUESTION = {
  id: '00000000-0000-4000-8000-000000000002',
  card_id: '00000000-0000-4000-8000-000000000001',
  topic_id: '00000000-0000-4000-8000-000000000004',
  text: 'Why does the bracket nest?',
  status: 'open',
  created_at: '2026-10-07T12:00:00Z',
  author: { name: null },
  mine: false,
  accepted_answer_id: null,
  answers: [],
};
const ONE_TO_ANSWER = { ...EMPTY, to_answer: [QUESTION], badge: 1 };
const SEEN = () => new Response(null, { status: 204 });

beforeEach(() => {
  jest.useFakeTimers();
  setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Routes = Parameters<typeof serveApi>[0];

async function renderQuestions(routes: Routes) {
  const requests = serveApi({ 'POST /questions/inbox/seen': [SEEN()], ...routes });
  const client = await renderScreen(<QuestionsScreen />);
  return { requests, client };
}

/** The requests sent, as `METHOD /path`. */
const sent = (requests: { method: string; path: string }[]) =>
  requests.map((r) => `${r.method} ${r.path}`);

describe('Questions: the frame', () => {
  it('shows the title Questions, on paper below the inset', async () => {
    await renderQuestions({ 'GET /questions/inbox': [json(200, EMPTY)] });

    expect(screen.getByRole('header', { name: 'Questions' })).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('questions-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });
});

describe('Questions: marking the inbox seen', () => {
  it('on focus, marks the inbox seen and then reads it again', async () => {
    const { requests } = await renderQuestions({ 'GET /questions/inbox': [json(200, EMPTY)] });

    const order = sent(requests);
    const seenAt = order.indexOf('POST /questions/inbox/seen');
    expect(seenAt).toBeGreaterThanOrEqual(0);
    expect(order.lastIndexOf('GET /questions/inbox')).toBeGreaterThan(seenAt);
  });

  it('marks it seen again each time the screen regains focus', async () => {
    const { requests } = await renderQuestions({ 'GET /questions/inbox': [json(200, EMPTY)] });

    act(() => {
      setFocused(false);
    });
    act(() => {
      setFocused(true);
    });
    await advance(0);

    expect(sent(requests).filter((r) => r === 'POST /questions/inbox/seen')).toHaveLength(2);
  });

  it('does not mark it seen while out of focus', async () => {
    setFocused(false);
    const { requests } = await renderQuestions({ 'GET /questions/inbox': [json(200, EMPTY)] });

    expect(sent(requests)).not.toContain('POST /questions/inbox/seen');
  });

  it('logs a failed seen by its kind and keeps the inbox', async () => {
    const warn = jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    await renderQuestions({
      'POST /questions/inbox/seen': [json(500, {})],
      'GET /questions/inbox': [json(200, EMPTY)],
    });

    expect(warn).toHaveBeenCalledWith('inbox_seen_failed', { kind: 'server' });
    expect(screen.getByText(/^Nothing to answer right now\./)).toBeOnTheScreen();
  });
});

describe('Questions: loading, empty and error', () => {
  it('shows a busy line while the inbox loads', async () => {
    await renderQuestions({ 'GET /questions/inbox': [new Promise<Response>(() => undefined)] });

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });

  it('shows the empty line when there is nothing to answer and no answer', async () => {
    await renderQuestions({ 'GET /questions/inbox': [json(200, EMPTY)] });

    expect(
      screen.getByText(
        'Nothing to answer right now. Pass a milestone to see questions from learners behind you.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('inbox-lists')).toBeNull();
  });

  it('holds the place of the lists when the inbox has a question', async () => {
    const { client } = await renderQuestions({
      'GET /questions/inbox': [json(200, ONE_TO_ANSWER)],
    });

    expect(client.getQueryData(INBOX_KEY)).toMatchObject({ badge: 1 });
    expect(screen.getByTestId('inbox-lists')).toBeOnTheScreen();
    expect(screen.queryByText(/^Nothing to answer right now\./)).toBeNull();
  });

  it('shows a fixed line and Retry on a failure, and Retry reads the inbox again', async () => {
    const { requests } = await renderQuestions({
      'GET /questions/inbox': [json(404, {}), json(404, {}), json(200, EMPTY)],
    });

    expect(screen.getByText("Couldn't load your questions.")).toBeOnTheScreen();
    const before = sent(requests).filter((r) => r === 'GET /questions/inbox').length;

    await pressRetry();

    expect(sent(requests).filter((r) => r === 'GET /questions/inbox')).toHaveLength(before + 1);
    expect(screen.getByText(/^Nothing to answer right now\./)).toBeOnTheScreen();
  });
});
