// The feed store inserts a card the API served into the running set (`insertCard`): right after
// the current card, never past the checkpoint, and never ahead of an answer already stored.
import type { Card, FeedSet } from '../../data';
import { logWarning } from '../../log';
import type { Attempt } from '../outbox';
import { checkpointIndex, pageCount, sendAttemptsTo, useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, predict, review, checkpoint } = cardsByType;

const store = () => useFeedStore.getState();

/** A card as the API serves it: with its server id. */
function served<C extends Card>(card: C, n: number): C {
  return { ...card, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` };
}

const added = served(review, 9);

function apiSet(cards: Card[]): FeedSet {
  return { ...makeSet(0, cards), setNumber: 3, feedDate: '2026-10-01' };
}

function ids(): (string | undefined)[] {
  return (store().set?.cards ?? []).map((card) => card.id);
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logWarning).mockClear();
});

describe('checkpointIndex', () => {
  it('is the index of the checkpoint card, else the number of cards', () => {
    expect(checkpointIndex([concept, quiz, checkpoint])).toBe(2);
    expect(checkpointIndex([concept, quiz])).toBe(2);
    expect(checkpointIndex([])).toBe(0);
  });
});

describe('insertCard', () => {
  it('places the card right after the current card and shifts the later cards', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2), served(predict, 3)]));
    store().setAnswer(0, { kind: 'choice', picked: 0 });
    const answers = store().answers;
    const pages = pageCount(store().set as FeedSet);

    expect(store().insertCard(added, store().index + 1)).toBe(1);

    expect(ids()).toStrictEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(pageCount(store().set as FeedSet)).toBe(pages + 1);
    expect(store().answers).toBe(answers);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('counts the inserted card in the totals when the summary is reached', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2)]));
    store().insertCard(added, 1);

    store().reachSummary();

    expect(store().totals).toStrictEqual({
      cards: 3,
      seconds: concept.estSeconds + quiz.estSeconds + added.estSeconds,
    });
  });

  it('clamps a position past the checkpoint to the checkpoint, so the card lands before it', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2), served(checkpoint, 3)]));

    expect(store().insertCard(added, 5)).toBe(2);

    expect(ids()[2]).toBe('00000000-0000-4000-8000-000000000009');
    expect(store().set?.cards[3]?.type).toBe('checkpoint');
    expect(logWarning).not.toHaveBeenCalled();
  });
});

describe('insertCard when the position does not fit (defensive)', () => {
  it('appends before the checkpoint when an answer exists at or after the position', () => {
    store().startSet(
      apiSet([served(concept, 1), served(quiz, 2), served(predict, 3), served(checkpoint, 4)]),
    );
    store().setAnswer(2, { kind: 'choice', picked: 1 });

    expect(store().insertCard(added, 1)).toBe(3);

    expect(ids()[3]).toBe('00000000-0000-4000-8000-000000000009');
    expect(store().set?.cards[4]?.type).toBe('checkpoint');
    expect(store().answers).toStrictEqual({ 2: { kind: 'choice', picked: 1 } });
    expect(logWarning).toHaveBeenCalledWith('insert_appended', { at: 1, index: 3 });
  });

  it('appends at the end of a set without a checkpoint when the position is not after the current card', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2)]));
    store().setIndex(1);

    expect(store().insertCard(added, 1)).toBe(2);

    expect(ids()[2]).toBe('00000000-0000-4000-8000-000000000009');
    expect(logWarning).toHaveBeenCalledWith('insert_appended', { at: 1, index: 2 });
  });

  it('appends at the checkpoint when the position is not after the current card', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2), served(checkpoint, 3)]));
    store().setIndex(1);

    expect(store().insertCard(added, 1)).toBe(2);

    expect(ids()[2]).toBe('00000000-0000-4000-8000-000000000009');
    expect(store().set?.cards[3]?.type).toBe('checkpoint');
    expect(logWarning).toHaveBeenCalledWith('insert_appended', { at: 1, index: 2 });
  });

  // Page 2 is the checkpoint in the first set and the summary page in the second: no page after
  // the one on screen can take the card, so it is dropped and no page shifts.
  it.each([
    ['on the checkpoint', [served(concept, 1), served(quiz, 2), served(checkpoint, 3)]],
    ['on the summary page of a set without a checkpoint', [served(concept, 1), served(quiz, 2)]],
  ])('drops the card when the learner is %s', (_where, cards) => {
    store().startSet(apiSet(cards));
    store().setIndex(2);
    const set = store().set;

    expect(store().insertCard(added, 3)).toBe(-1);

    expect(store().set).toBe(set);
    expect(logWarning).toHaveBeenCalledWith('insert_dropped', { at: 3, index: 2 });
    expect(logWarning).not.toHaveBeenCalledWith('insert_appended', expect.anything());
  });

  // The learner answered card 0, typed a draft on the checkpoint (page 3), then went back to 0: an
  // append at the checkpoint would put the draft's stored answer on the inserted card's page.
  it('drops the card when the checkpoint already holds an answer', () => {
    const draft = { kind: 'checkpoint', code: 's("bd")', status: 'idle', grade: null } as const;
    store().startSet(
      apiSet([served(concept, 1), served(quiz, 2), served(predict, 3), served(checkpoint, 4)]),
    );
    store().setAnswer(0, { kind: 'choice', picked: 1 });
    store().setAnswer(3, draft);
    const { set, answers } = store();

    expect(store().insertCard(added, 2)).toBe(-1);

    expect(store().set).toBe(set);
    expect(store().answers).toBe(answers);
    expect(logWarning).toHaveBeenCalledWith('insert_dropped', { at: 2, index: 0 });
  });

  it('logs no card text when it appends', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2)]));
    store().setIndex(1);

    store().insertCard(added, 0);

    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain(review.prompt);
  });
});

// `shownAt` and `seenSent` are keyed by page, like the answers: an insertion at a page already
// visited (a back-swipe) must move them with their cards, or the inserted card takes them over.
describe('insertCard after a back-swipe', () => {
  afterEach(() => {
    sendAttemptsTo(null);
    jest.restoreAllMocks();
  });

  it('moves the shown times and the sent seen with their cards', () => {
    const add = jest.fn<undefined, [Attempt]>();
    sendAttemptsTo({ add });
    let clock = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const inserted = served(concept, 9);
    store().startSet(apiSet([served(quiz, 1), served(concept, 2), served(predict, 3)]));
    store().setAnswer(0, { kind: 'choice', picked: 0 });
    clock = 2_000;
    store().setIndex(1);
    clock = 3_000;
    store().setIndex(2);
    store().setIndex(1);
    store().setIndex(0);

    expect(store().insertCard(inserted, 1)).toBe(1);

    expect(store().shownAt).toStrictEqual({ 0: 1_000, 2: 2_000, 3: 3_000 });
    expect(store().seenSent).toStrictEqual({ 2: true });
    add.mockClear();
    clock = 5_000;
    store().setIndex(1);
    clock = 6_000;
    store().setIndex(2);
    store().setIndex(3);
    expect(add.mock.calls).toStrictEqual([
      [
        expect.objectContaining({
          cardId: inserted.id,
          response: { seen: true },
          durationMs: 1_000,
        }),
      ],
    ]);
  });
});

describe('insertCard, card ids and no set', () => {
  it('does not insert a card whose id is already in the set, and returns its index', () => {
    store().startSet(apiSet([served(concept, 1), added, served(quiz, 2)]));
    const set = store().set;

    expect(store().insertCard(added, 2)).toBe(1);

    expect(store().set).toBe(set);
  });

  it('inserts a card without an id even when another card has none', () => {
    store().startSet(makeSet(0, [concept, quiz]));

    expect(store().insertCard(review, 1)).toBe(1);

    expect(store().set?.cards).toStrictEqual([concept, review, quiz]);
  });

  it('does nothing and returns -1 with no set', () => {
    expect(store().insertCard(added, 1)).toBe(-1);

    expect(store().set).toBeNull();
  });
});
