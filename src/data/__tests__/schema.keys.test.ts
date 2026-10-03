// A code card's keypad (M9 plan K, Task 3): the API's `keys` on an exercise or a checkpoint, its
// groups of keys (`calls`, `notation`, `methods`, `digits`) and its action key. A key's `caret`
// counts back from the end of its insert. A card without `keys` (the bundled demo cards, an older
// API) parses as before, leaving the field absent; `null` (a language without keys) is kept.
import fixture from '../__fixtures__/cards.fixture.json';
import type { CheckpointCard, ExerciseCard } from '../index';
import {
  keyGroupSchema,
  keypadSchema,
  keySpecSchema,
  type Keypad,
  type KeySpec,
} from '../keypadSchema';
import { cardSchema } from '../schema';

/** True only when A and B are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const keySpecHasItsShape: Same<KeySpec, { label: string; insert: string; caret: number }> = true;
const keypadHasItsShape: Same<
  Keypad,
  {
    groups: { name: 'calls' | 'notation' | 'methods' | 'digits'; keys: KeySpec[] }[];
    action: 'run' | 'submit';
  }
> = true;
const codeCardsCarryIt: Same<
  [ExerciseCard['keys'], CheckpointCard['keys']],
  [Keypad | null | undefined, Keypad | null | undefined]
> = true;

const CALL: KeySpec = { label: 's("")', insert: 's("")', caret: 2 };
const KEYPAD: Keypad = {
  groups: [
    { name: 'calls', keys: [CALL] },
    { name: 'notation', keys: [{ label: '< >', insert: '<>', caret: 1 }] },
    { name: 'methods', keys: [{ label: '.fast(', insert: '.fast(', caret: 0 }] },
    { name: 'digits', keys: [{ label: '16', insert: '16', caret: 0 }] },
  ],
  action: 'run',
};
const codeCards = fixture.cards.filter((card) => ['exercise', 'checkpoint'].includes(card.type));

/** The dotted path of every issue `cardSchema` reports for the card with `keys`. */
function keysIssues(card: object, keys: unknown): string[] {
  const result = cardSchema.safeParse({ ...card, keys });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

/** `KEYPAD` with its first group's keys replaced. */
function withCalls(keys: unknown[]): unknown {
  return { ...KEYPAD, groups: [{ name: 'calls', keys }, ...KEYPAD.groups.slice(1)] };
}

describe("a code card's keys", () => {
  it('have the planned types, on the exercise and the checkpoint', () => {
    expect([keySpecHasItsShape, keypadHasItsShape, codeCardsCarryIt]).toEqual([true, true, true]);
  });

  it.each(codeCards)('parse to the typed keypad on a $type card, as sent', (card) => {
    expect(cardSchema.parse({ ...card, keys: KEYPAD })).toEqual({ ...card, keys: KEYPAD });
    expect(cardSchema.parse({ ...card, keys: { ...KEYPAD, action: 'submit' } })).toMatchObject({
      keys: { action: 'submit' },
    });
  });

  it.each(codeCards)('are kept as null on a $type card, and absent when not sent', (card) => {
    expect(cardSchema.parse({ ...card, keys: null })).toEqual({ ...card, keys: null });
    expect(cardSchema.parse(card)).toEqual(card);
    expect(cardSchema.parse(card)).not.toHaveProperty('keys');
  });

  it('may hold no group, and a group of 12 keys', () => {
    expect(keypadSchema.parse({ groups: [], action: 'run' })).toEqual({
      groups: [],
      action: 'run',
    });
    const twelve = Array.from({ length: 12 }, () => CALL);
    expect(keyGroupSchema.parse({ name: 'calls', keys: twelve }).keys).toHaveLength(12);
  });

  it.each([
    [
      'a caret past the start of the insert',
      withCalls([{ ...CALL, caret: 6 }]),
      ['keys.groups.0.keys.0'],
    ],
    ['a negative caret', withCalls([{ ...CALL, caret: -1 }]), ['keys.groups.0.keys.0.caret']],
    ['a fractional caret', withCalls([{ ...CALL, caret: 0.5 }]), ['keys.groups.0.keys.0.caret']],
    [
      'an unknown group name',
      { ...KEYPAD, groups: [{ name: 'keywords', keys: [CALL] }] },
      ['keys.groups.0.name'],
    ],
    [
      'a group of 13 keys',
      withCalls(Array.from({ length: 13 }, () => CALL)),
      ['keys.groups.0.keys'],
    ],
    ['a group with no key', withCalls([]), ['keys.groups.0.keys']],
    ['five groups', { ...KEYPAD, groups: [...KEYPAD.groups, KEYPAD.groups[0]] }, ['keys.groups']],
    ['an unknown action', { ...KEYPAD, action: 'check' }, ['keys.action']],
    [
      'a label of 13 characters',
      withCalls([{ ...CALL, label: 'x'.repeat(13) }]),
      ['keys.groups.0.keys.0.label'],
    ],
    [
      'an empty insert',
      withCalls([{ ...CALL, insert: '', caret: 0 }]),
      ['keys.groups.0.keys.0.insert'],
    ],
    [
      'an insert of 41 characters',
      withCalls([{ ...CALL, insert: 'x'.repeat(41) }]),
      ['keys.groups.0.keys.0.insert'],
    ],
  ])('refuse %s', (_name, keys, paths) => {
    expect(codeCards.map((card) => keysIssues(card, keys))).toEqual([paths, paths]);
  });

  it('read a key of 12 characters inserting 40, with its caret at the start', () => {
    const key = { label: 'x'.repeat(12), insert: 'y'.repeat(40), caret: 40 };

    expect(keySpecSchema.parse(key)).toEqual(key);
  });
});
