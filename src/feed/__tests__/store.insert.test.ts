// The feed store inserts a card the API served into the running set (`insertCard`): right after
// the current card, never past the checkpoint, and never ahead of an answer already stored.
import type { Card, FeedSet } from '../../data';
import { logWarning } from '../../log';
import { checkpointIndex, pageCount, useFeedStore } from '../store';
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

  it('logs no card text when it appends', () => {
    store().startSet(apiSet([served(concept, 1), served(quiz, 2)]));
    store().setIndex(1);

    store().insertCard(added, 0);

    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain(review.prompt);
  });

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
