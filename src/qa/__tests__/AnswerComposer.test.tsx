// The answer field under a question (src/qa/AnswerComposer.tsx) while the API cannot be reached
// (offline-topic plan O6): Answer is disabled with the reason and posts nothing. Over the real API
// client and a fake network; nothing leaves the test.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useOnline } from '../../api/useOnline';
import type { Question } from '../../data/qa';
import { AnswerComposer } from '../AnswerComposer';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('../../api/useOnline', () => ({ useOnline: jest.fn() }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q_ID = uuid(1);
const QUESTION: Question = {
  id: Q_ID,
  cardId: uuid(81),
  topicId: uuid(90),
  text: 'How do two patterns play at once?',
  status: 'open',
  createdAt: '2026-10-05T09:30:00Z',
  author: { name: 'ada', level: 1 },
  mine: false,
  acceptedAnswerId: null,
  answers: [],
};

beforeEach(() => {
  jest.mocked(useOnline).mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Draws the composer, types an answer into it and presses Answer. */
async function typeAndSend() {
  const requests = serveApi({
    [`POST /questions/${Q_ID}/answers`]: [new Promise(() => undefined)],
  });
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <AnswerComposer question={QUESTION} />
    </Cache>,
  );
  fireEvent.changeText(screen.getByLabelText('Write an answer'), 'Stack them.');
  fireEvent.press(screen.getByRole('button', { name: 'Answer' }));
  await act(async () => {
    await Promise.resolve();
  });
  return requests;
}

describe('AnswerComposer', () => {
  it('disables Answer offline with the reason, and posts nothing', async () => {
    jest.mocked(useOnline).mockReturnValue(false);
    const requests = await typeAndSend();

    expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
    expect(screen.getByText('Needs a connection')).toBeOnTheScreen();
    expect(requests).toHaveLength(0);
  });

  it('sends online, with no reason', async () => {
    const requests = await typeAndSend();

    expect(screen.queryByText('Needs a connection')).toBeNull();
    expect(requests).toHaveLength(1);
  });
});
