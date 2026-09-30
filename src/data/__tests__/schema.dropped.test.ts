// The cards a set's slot parser drops (src/data/schema.ts): a card of a type the app does not
// know, an exercise in another language, and a card with a server id that fails its schema. The
// set keeps the rest and names each dropped card's id in `droppedIds`, so the feed session can
// record it as skipped and the server can finish the set.
import { logWarning } from '../../log';
import fixture from '../__fixtures__/cards.fixture.json';
import { apiSetSchema, feedSetSchema } from '../schema';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [concept, quiz, , exercise] = fixture.cards;
const checkpoint = fixture.cards.find((card) => card.type === 'checkpoint');

function setOf(cards: unknown[]) {
  return { ...fixture, setNumber: 1, cards };
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('the cards a set drops', () => {
  it('names the id of each card it drops, in order, and keeps the rest', () => {
    const cards = [
      { ...concept, id: id(1) },
      { type: 'video', id: id(2), title: 'Clip' },
      { ...exercise, id: id(3), lang: 'python' },
      { ...quiz, id: id(4), correct: 'secret-marker' },
      { ...quiz, id: id(5) },
    ];

    const set = feedSetSchema.parse(setOf(cards));

    expect(set.cards.map((card) => card.id)).toStrictEqual([id(1), id(5)]);
    expect(set.droppedIds).toStrictEqual([id(2), id(3), id(4)]);
  });

  it('logs a dropped card that fails its schema by its paths, never its content', () => {
    feedSetSchema.parse(setOf([{ ...quiz, id: id(4), correct: 'secret-marker' }, concept]));

    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['card_invalid', { paths: 'correct' }],
    ]);
  });

  it('still refuses the set for a card without an id that fails its schema', () => {
    const result = feedSetSchema.safeParse(setOf([{ ...quiz, correct: 'x' }, concept]));

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
      'cards.0.correct',
    ]);
  });

  it('drops a card without a usable id and names no id for it', () => {
    const cards = [{ type: 'video' }, { ...quiz, id: 'r1', correct: 'x' }, concept];

    const set = feedSetSchema.parse(setOf([cards[0], concept]));

    expect(set.cards).toHaveLength(1);
    expect(set).not.toHaveProperty('droppedIds');
    expect(feedSetSchema.safeParse(setOf(cards)).success).toBe(false);
  });

  it('names no id for a checkpoint it drops: its id is a milestone, not a card', () => {
    const set = feedSetSchema.parse(setOf([{ ...checkpoint, id: id(6), rubric: [] }, concept]));

    expect(set.cards).toHaveLength(1);
    expect(set).not.toHaveProperty('droppedIds');
  });

  it('drops cards the same way in a set from the API, which needs its date', () => {
    const cards = [{ type: 'video', id: id(2) }, concept];

    const set = apiSetSchema.parse({ ...setOf(cards), feedDate: '2026-10-01' });

    expect(set.droppedIds).toStrictEqual([id(2)]);
    expect(apiSetSchema.safeParse(setOf(cards)).success).toBe(false);
  });
});
