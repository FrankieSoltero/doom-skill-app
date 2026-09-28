import { pageCount, useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

const { concept, quiz, exercise, checkpoint } = cardsByType;

// Topic streak 3; two cards, 30 + 20 seconds.
const firstSet = makeSet(3, [concept, quiz]);
// Topic streak 9, which a later set must not take; two cards, 90 + 120 seconds.
const secondSet = makeSet(9, [exercise, checkpoint]);

const store = () => useFeedStore.getState();

// The store is a module singleton. Replace its whole state before each test, without going
// through the `reset` action under test, so the order of tests does not matter.
beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('the initial state and pageCount', () => {
  it('starts with no set, nothing answered and nothing counted', () => {
    expect(store()).toMatchObject({
      set: null,
      index: 0,
      answers: {},
      totals: { cards: 0, seconds: 0 },
      streak: 0,
      streakCounted: false,
    });
  });

  it('counts the cards plus one Summary page', () => {
    expect(pageCount(firstSet)).toBe(3);
    expect(pageCount(makeSet(0, []))).toBe(1);
  });
});

describe('startSet', () => {
  it('takes the streak from the topic on the first set', () => {
    store().startSet(firstSet);

    expect(store()).toMatchObject({ set: firstSet, index: 0, answers: {}, streak: 3 });
  });

  it('starts at the first page with no answers and keeps totals and streak', () => {
    store().startSet(firstSet);
    store().setIndex(2);
    store().setAnswer(1, { kind: 'choice', picked: 0 });
    store().reachSummary();

    store().startSet(secondSet);

    expect(store()).toMatchObject({
      set: secondSet,
      index: 0,
      answers: {},
      totals: { cards: 2, seconds: 50 },
      streak: 4,
    });
  });
});

describe('setIndex', () => {
  it('moves to a page inside the set', () => {
    store().startSet(firstSet);
    store().setIndex(1);

    expect(store().index).toBe(1);
  });

  it('clamps below the first page and past the Summary page', () => {
    store().startSet(firstSet);
    store().setIndex(-1);
    expect(store().index).toBe(0);

    store().setIndex(99);
    expect(store().index).toBe(2);
  });

  it('stays at 0 with no set', () => {
    store().setIndex(2);

    expect(store().index).toBe(0);
  });
});

describe('setAnswer', () => {
  it('stores an answer by card index and replaces it on a second call', () => {
    store().startSet(firstSet);
    store().setAnswer(1, { kind: 'choice', picked: 0 });
    store().setAnswer(1, { kind: 'choice', picked: 1 });

    expect(store().answers).toEqual({ 1: { kind: 'choice', picked: 1 } });
  });
});

describe('reachSummary', () => {
  it('adds the set to the totals and counts the streak the first time', () => {
    store().startSet(firstSet);
    store().reachSummary();

    expect(store()).toMatchObject({
      totals: { cards: 2, seconds: 50 },
      streak: 4,
      streakCounted: true,
    });
  });

  it('adds a later set to the totals without counting the streak again', () => {
    store().startSet(firstSet);
    store().reachSummary();
    store().startSet(secondSet);
    store().reachSummary();

    expect(store()).toMatchObject({
      totals: { cards: 4, seconds: 260 },
      streak: 4,
      streakCounted: true,
    });
  });

  it('counts one set once when its Summary is reached twice', () => {
    store().startSet(firstSet);
    store().reachSummary();
    store().reachSummary();

    expect(store()).toMatchObject({ totals: { cards: 2, seconds: 50 }, streak: 4 });
  });

  it('does nothing with no set started', () => {
    store().reachSummary();

    expect(store()).toMatchObject({
      totals: { cards: 0, seconds: 0 },
      streak: 0,
      streakCounted: false,
    });
  });
});

describe('reset', () => {
  it('returns to the initial state, streak included', () => {
    store().startSet(firstSet);
    store().setIndex(1);
    store().setAnswer(1, { kind: 'choice', picked: 0 });
    store().reachSummary();

    store().reset();

    expect(store()).toEqual(useFeedStore.getInitialState());
  });

  it('takes the topic streak again for the first set after a reset', () => {
    store().startSet(firstSet);
    store().reachSummary();
    store().reset();

    store().startSet(secondSet);

    expect(store().streak).toBe(9);
  });
});
