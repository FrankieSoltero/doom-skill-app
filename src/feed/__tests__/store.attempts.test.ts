// The feed store hands each answered card to the attempt outbox (src/feed/outbox.ts), through the
// sink the outbox installs (`sendAttemptsTo`). The store's own answer, which the card shows and
// the gate reads, is stored at once either way.
import type { Card, FeedSet } from '../../data';
import type { Attempt } from '../outbox';
import { sendAttemptsTo, useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

const store = () => useFeedStore.getState();
const add = jest.fn<undefined, [Attempt]>();

/** A card as the API serves it: with its server id. */
function served<C extends Card>(card: C, n: number): C {
  return { ...card, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` };
}

/** A set from the API, stored for 1 October, set 3. */
function apiSet(cards: Card[]): FeedSet {
  return { ...makeSet(0, cards), setNumber: 3, feedDate: '2026-10-01' };
}

let clock = 0;
const at = (ms: number) => {
  clock = ms;
};

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  add.mockReset();
  sendAttemptsTo({ add });
  clock = 1_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  sendAttemptsTo(null);
  jest.restoreAllMocks();
});

describe('the store hands an answered card to the outbox', () => {
  it('adds a quiz pick with the card id, the time since the card was shown, the date and set', () => {
    store().startSet(apiSet([served(quiz, 1)]));
    at(4_500);

    store().setAnswer(0, { kind: 'choice', picked: 1 });

    expect(add.mock.calls).toStrictEqual([
      [
        {
          cardId: '00000000-0000-4000-8000-000000000001',
          response: { choice: 1 },
          durationMs: 3_500,
          feedDate: '2026-10-01',
          setNumber: 3,
        },
      ],
    ]);
    expect(store().answers[0]).toStrictEqual({ kind: 'choice', picked: 1 });
  });

  it('times a later card from when its page was first shown', () => {
    store().startSet(apiSet([served(concept, 1), served(predict, 2)]));
    at(2_000);
    store().setIndex(1);
    at(2_600);
    store().setIndex(0);
    at(2_700);
    store().setIndex(1);
    at(9_000);

    store().setAnswer(1, { kind: 'choice', picked: 0 });

    expect(add.mock.lastCall?.[0]).toMatchObject({ response: { choice: 0 }, durationMs: 7_000 });
  });

  it('adds a review rating by its name, and nothing for the reveal', () => {
    store().startSet(apiSet([served(review, 1)]));

    store().setAnswer(0, { kind: 'review', revealed: true, rating: null });
    expect(add).not.toHaveBeenCalled();

    (['again', 'hard', 'good', 'easy'] as const).forEach((name, position) => {
      store().setAnswer(0, { kind: 'review', revealed: true, rating: position as 0 | 1 | 2 | 3 });
      expect(add.mock.lastCall?.[0].response).toStrictEqual({ rating: name });
    });
  });

  it('adds every checked exercise code, and nothing for an edit', () => {
    store().startSet(apiSet([served(exercise, 1)]));

    store().setAnswer(0, { kind: 'exercise', code: 's("bd")', result: null });
    store().setAnswer(0, { kind: 'exercise', code: 's("bd")', result: 'fail' });
    store().setAnswer(0, { kind: 'exercise', code: 's("bd sd")', result: null });
    store().setAnswer(0, { kind: 'exercise', code: 's("bd sd")', result: 'pass' });

    expect(add.mock.calls.map(([attempt]) => attempt.response)).toStrictEqual([
      { code: 's("bd")' },
      { code: 's("bd sd")' },
    ]);
  });
});

describe('the store hands a concept card to the outbox as seen', () => {
  it('when the learner moves on from it, once', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2)]));
    at(6_000);

    store().setIndex(1);
    store().setIndex(0);
    store().setIndex(1);

    expect(add.mock.calls).toStrictEqual([
      [
        {
          cardId: '00000000-0000-4000-8000-000000000001',
          response: { seen: true },
          durationMs: 5_000,
          feedDate: '2026-10-01',
          setNumber: 3,
        },
      ],
    ]);
  });

  it('when the learner moves on from it to the Summary page', () => {
    store().startSet(apiSet([served(concept, 1)]));

    store().setIndex(1);

    expect(add.mock.calls.map(([attempt]) => attempt.response)).toStrictEqual([{ seen: true }]);
  });

  it('not for a page that does not move on, or a concept not left forward', () => {
    store().startSet(apiSet([served(quiz, 1), served(concept, 2)]));

    store().setIndex(0);
    store().setIndex(1);
    store().setIndex(0);

    expect(add).not.toHaveBeenCalled();
  });

  it('keeps the time within what the API takes, 0 to one hour', () => {
    store().startSet(apiSet([served(quiz, 1), served(quiz, 2)]));
    at(1_000 + 3_600_001);
    store().setAnswer(0, { kind: 'choice', picked: 0 });
    store().setIndex(1);
    at(500);
    store().setAnswer(1, { kind: 'choice', picked: 0 });

    expect(add.mock.calls.map(([attempt]) => attempt.durationMs)).toStrictEqual([3_600_000, 0]);
  });
});

describe('the store adds nothing', () => {
  it('for a checkpoint: its id is a milestone, submitted in a later milestone of the plan', () => {
    store().startSet(apiSet([served(checkpoint, 1)]));

    store().setAnswer(0, { kind: 'checkpoint', code: 's("bd")', status: 'done', grade: null });

    expect(add).not.toHaveBeenCalled();
  });

  it('for a card without an id, such as the demo cards', () => {
    store().startSet(apiSet([quiz, concept]));

    store().setAnswer(0, { kind: 'choice', picked: 0 });
    store().setIndex(1);
    store().setIndex(2);

    expect(add).not.toHaveBeenCalled();
    expect(store().answers[0]).toStrictEqual({ kind: 'choice', picked: 0 });
  });

  it('for a set without a date, such as the demo sets', () => {
    store().startSet(makeSet(0, [served(quiz, 1)]));

    store().setAnswer(0, { kind: 'choice', picked: 0 });

    expect(add).not.toHaveBeenCalled();
  });

  it('for an answer of the wrong kind for its card, or at a page with no card', () => {
    store().startSet(apiSet([served(quiz, 1)]));

    store().setAnswer(0, { kind: 'exercise', code: 'x', result: 'pass' });
    store().setAnswer(5, { kind: 'choice', picked: 0 });

    expect(add).not.toHaveBeenCalled();
  });

  it('with no outbox installed, and still stores the answer', () => {
    sendAttemptsTo(null);
    store().startSet(apiSet([served(quiz, 1)]));

    store().setAnswer(0, { kind: 'choice', picked: 0 });

    expect(store().answers[0]).toStrictEqual({ kind: 'choice', picked: 0 });
  });

  it('before any set is started', () => {
    store().setAnswer(0, { kind: 'choice', picked: 0 });
    store().setIndex(1);

    expect(add).not.toHaveBeenCalled();
  });
});
