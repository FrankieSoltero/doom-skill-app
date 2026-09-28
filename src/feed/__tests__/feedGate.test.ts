import { canAdvanceFrom, canGoTo, nextMove } from '../feedGate';
import type { GateState } from '../feedGate';
import { cardsByType, makeSet } from '../testing/sets';

const { concept, quiz } = cardsByType;

// Pages: 0 concept (always answered), 1 quiz (answered once picked), 2 the Summary.
const set = makeSet(3, [concept, quiz]);
const NONE: ReadonlySet<number> = new Set();
const picked = { 1: { kind: 'choice', picked: 0 } } as const;

const at = (index: number, answers: GateState['answers'] = {}): GateState => ({
  set,
  index,
  answers,
  round: 2,
});

const NO_SET: GateState = { set: null, index: 0, answers: {}, round: 0 };

describe('canAdvanceFrom', () => {
  it.each([
    { row: 'no set', state: NO_SET, failed: NONE, expected: false },
    { row: 'an answered card', state: at(0), failed: NONE, expected: true },
    { row: 'an unanswered card', state: at(1), failed: NONE, expected: false },
    { row: 'a card once answered', state: at(1, picked), failed: NONE, expected: true },
    { row: 'a card that failed to render', state: at(1), failed: new Set([1]), expected: true },
    { row: 'the Summary page', state: at(2), failed: NONE, expected: false },
  ])('$row: $expected', ({ state, failed, expected }) => {
    expect(canAdvanceFrom(state, failed)).toBe(expected);
  });
});

describe('nextMove', () => {
  // The state is in round 2; a "next" from round 1 comes from a card of the set before.
  it.each([
    { row: 'the current card, answered: go', state: at(0), page: 0, round: 2, expected: 'go' },
    {
      row: 'the current card, unanswered: blocked',
      state: at(1),
      page: 1,
      round: 2,
      expected: 'blocked',
    },
    {
      row: 'another page than the current one: none',
      state: at(0),
      page: 1,
      round: 2,
      expected: 'none',
    },
    { row: 'the Summary page: none', state: at(2), page: 2, round: 2, expected: 'none' },
    { row: 'no set: none', state: NO_SET, page: 0, round: 0, expected: 'none' },
    {
      row: 'an earlier round, same page, answered: none',
      state: at(0),
      page: 0,
      round: 1,
      expected: 'none',
    },
    {
      row: 'an earlier round, same page, unanswered: none',
      state: at(1),
      page: 1,
      round: 1,
      expected: 'none',
    },
    { row: 'a later round: none', state: at(0), page: 0, round: 3, expected: 'none' },
  ])('$row', ({ state, page, round, expected }) => {
    expect(nextMove(state, NONE, { page, round })).toBe(expected);
  });
});

describe('canGoTo', () => {
  it.each([
    { row: 'back one page', state: at(1), target: 0, expected: true },
    { row: 'back from the Summary', state: at(2), target: 0, expected: true },
    { row: 'the current page', state: at(1), target: 1, expected: true },
    { row: 'one ahead, gate open', state: at(0), target: 1, expected: true },
    { row: 'one ahead, gate closed', state: at(1), target: 2, expected: false },
    { row: 'two ahead, gate open', state: at(0), target: 2, expected: false },
    { row: 'not a number', state: at(0), target: Number.NaN, expected: false },
  ])('$row: $expected', ({ state, target, expected }) => {
    expect(canGoTo(state, NONE, target)).toBe(expected);
  });
});
