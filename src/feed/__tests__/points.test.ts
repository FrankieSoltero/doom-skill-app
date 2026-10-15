// Provisional points (offline-topic plan Task 7, spec O5): a locally graded answer adds its value
// at once (`addProvisional`), and the server's reply replaces it (`settle`). `pointsEarned` is the
// settled points plus the provisional ones; `pendingCount` counts the values still waiting.
import { answerPoints } from '../points';
import { useFeedStore } from '../store';
import { cardsByType } from '../testing/sets';

const { concept, quiz, exercise, review, checkpoint } = cardsByType;

const store = () => useFeedStore.getState();
const CARD = 'card-1';

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('addProvisional and settle', () => {
  it('adds a correct quiz offline as +5 provisional, pending', () => {
    store().addProvisional(CARD, 5, { kind: 'quiz', correct: true });

    expect(store().pointsEarned).toBe(5);
    expect(store().settledPoints).toBe(0);
    expect(store().pendingCount).toBe(1);
  });

  it('adds nothing and leaves nothing pending for a skip (0)', () => {
    store().addProvisional(CARD, 0);

    expect(store().pointsEarned).toBe(0);
    expect(store().pendingCount).toBe(0);
  });

  it('replaces the provisional 5 with the reply of 5: settled 5, nothing pending', () => {
    store().addProvisional(CARD, 5, { kind: 'quiz', correct: true });

    const local = store().settle(CARD, 5);

    expect(local).toStrictEqual({ kind: 'quiz', correct: true });
    expect(store().pointsEarned).toBe(5);
    expect(store().settledPoints).toBe(5);
    expect(store().provisional).toStrictEqual({});
    expect(store().pendingCount).toBe(0);
  });

  it('drops the sum to the reply when it says 2 (a repeat)', () => {
    store().addProvisional(CARD, 5, { kind: 'quiz', correct: true });
    store().addProvisional('card-2', 5, { kind: 'quiz', correct: true });

    store().settle(CARD, 2);

    expect(store().pointsEarned).toBe(7);
    expect(store().pendingCount).toBe(1);
  });

  it('settles a reply with no provisional value (an earlier run, a replay) into the sum', () => {
    expect(store().settle(CARD, 5)).toBeNull();

    expect(store().settledPoints).toBe(5);
    expect(store().pointsEarned).toBe(5);
  });

  it('settles two answers at one card in the order they were made', () => {
    store().addProvisional(CARD, 1, { kind: 'exercise', correct: false });
    store().addProvisional(CARD, 8, { kind: 'exercise', correct: true });

    expect(store().settle(CARD, 1)).toStrictEqual({ kind: 'exercise', correct: false });
    expect(store().pointsEarned).toBe(9);
    expect(store().pendingCount).toBe(1);
  });

  it('keeps addPoints adding to the settled points', () => {
    store().addProvisional(CARD, 5);
    store().addPoints(3);
    store().addPoints(-1);

    expect(store().settledPoints).toBe(3);
    expect(store().pointsEarned).toBe(8);
  });

  it('reads a reply that is not a number above 0 as 0', () => {
    store().addProvisional(CARD, 5);

    store().settle(CARD, Number.NaN);

    expect(store().pointsEarned).toBe(0);
    expect(store().pendingCount).toBe(0);
  });

  it('clears every value at startSet and at reset', () => {
    store().addProvisional(CARD, 5);
    store().addPoints(2);
    store().reset();

    expect(store().pointsEarned).toBe(0);
    expect(store().settledPoints).toBe(0);
    expect(store().pendingCount).toBe(0);
  });
});

describe('answerPoints: the local value of an answer the outbox sends', () => {
  it.each([
    ['a right pick', quiz, { kind: 'choice', picked: 0 }, { points: 5, correct: true }],
    ['a wrong pick', quiz, { kind: 'choice', picked: 1 }, { points: 1, correct: false }],
    [
      'a passed exercise',
      exercise,
      { kind: 'exercise', code: 'x', result: 'pass' },
      { points: 8, correct: true },
    ],
    [
      'a failed exercise',
      exercise,
      { kind: 'exercise', code: 'x', result: 'fail' },
      { points: 1, correct: false },
    ],
    [
      'a review rated good',
      review,
      { kind: 'review', revealed: true, rating: 2 },
      { points: 3, correct: null },
    ],
    [
      'a review rated again',
      review,
      { kind: 'review', revealed: true, rating: 0 },
      { points: 0, correct: null },
    ],
  ] as const)('%s', (_case, card, answer, expected) => {
    const { points, correct } = expected;
    expect(answerPoints(card, answer)).toStrictEqual({
      points,
      grade: { kind: card.type, correct },
    });
  });

  it('is null for an answer that is not sent: an edit, a reveal, a checkpoint, a mismatch', () => {
    expect(answerPoints(exercise, { kind: 'exercise', code: 'x', result: null })).toBeNull();
    expect(answerPoints(review, { kind: 'review', revealed: true, rating: null })).toBeNull();
    const done = { kind: 'checkpoint', code: 'x', status: 'done', grade: null } as const;
    expect(answerPoints(checkpoint, done)).toBeNull();
    expect(answerPoints(concept, { kind: 'choice', picked: 0 })).toBeNull();
  });
});
