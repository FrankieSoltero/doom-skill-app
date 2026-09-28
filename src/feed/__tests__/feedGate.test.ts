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
});

describe('canAdvanceFrom', () => {
  it.each([
    { row: 'no set', state: { set: null, index: 0, answers: {} }, failed: NONE, expected: false },
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
  it.each([
    { row: 'the current card, answered: go', state: at(0), page: 0, expected: 'go' },
    { row: 'the current card, unanswered: blocked', state: at(1), page: 1, expected: 'blocked' },
    { row: 'another page than the current one: none', state: at(0), page: 1, expected: 'none' },
    { row: 'the Summary page: none', state: at(2), page: 2, expected: 'none' },
    {
      row: 'no set: none',
      state: { set: null, index: 0, answers: {} },
      page: 0,
      expected: 'none',
    },
  ])('$row', ({ state, page, expected }) => {
    expect(nextMove(state, NONE, page)).toBe(expected);
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
