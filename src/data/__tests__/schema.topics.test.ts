// A topic without Strudel (M6 hardening Task 8, `sql-window-functions`): a concept card may come
// without its snippet and cycles, and an exercise may be in `sql`. Exercises in any other
// language are still dropped (schema.test.ts, schema.dropped.test.ts).
import { logWarning } from '../../log';
import fixture from '../__fixtures__/cards.fixture.json';
import type { ConceptCard, ExerciseCard } from '../index';
import { cardSchema, feedSetSchema } from '../schema';

const [concept, , , exercise] = fixture.cards;
const { snippet, snippetComment, cycles, ...plainConcept } = concept ?? {};
const sqlExercise = {
  ...exercise,
  lang: 'sql',
  title: 'Rank each salary within its department',
  starterCode: 'SELECT depname, salary FROM empsalary;',
  checks: [{ kind: 'contains', value: 'PARTITION BY depname', ignoreWhitespace: true }],
};

/** True only when A and B are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The server's `Lang` (services/api/app/llm/resolve_model.py). */
type ServerLang = 'strudel' | 'sql' | 'python' | 'javascript' | 'text';
const exerciseLangsAreKnown: Same<ExerciseCard['lang'], ServerLang> = true;
const conceptCodeIsOptional: Same<
  Pick<ConceptCard, 'snippet' | 'snippetComment' | 'cycles'>,
  {
    snippet?: string | undefined;
    snippetComment?: string | undefined;
    cycles?: string[] | undefined;
  }
> = true;

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('a card of a topic without Strudel', () => {
  it('holds at compile time: the known exercise languages, optional concept code', () => {
    expect([exerciseLangsAreKnown, conceptCodeIsOptional]).toEqual([true, true]);
  });

  it('parses a concept card with no snippet, comment or cycles', () => {
    expect([snippet, snippetComment, cycles].every((field) => field !== undefined)).toBe(true);

    expect(cardSchema.parse(plainConcept)).toStrictEqual(plainConcept);
  });

  it('still refuses an empty snippet or an empty cycle list when they are given', () => {
    for (const patch of [{ snippet: '' }, { cycles: [] }]) {
      expect(cardSchema.safeParse({ ...plainConcept, ...patch }).success).toBe(false);
    }
  });

  it.each(['sql', 'python', 'javascript', 'text'])(
    'keeps a %s exercise and logs nothing',
    (lang) => {
      const card = { ...sqlExercise, lang };
      const set = feedSetSchema.parse({ ...fixture, setNumber: 1, cards: [card] });

      expect(set.cards).toStrictEqual([card]);
      expect(logWarning).not.toHaveBeenCalled();
    },
  );

  it('still parses every fixture card unchanged', () => {
    expect(fixture.cards.map((card) => cardSchema.parse(card))).toStrictEqual(fixture.cards);
  });
});
