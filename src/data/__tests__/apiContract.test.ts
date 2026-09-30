// The API's feed response against the app's card schema (M3 plan, Task 13). The fixture is a
// copy of services/api/tests/fixtures/feed_response.json, the whole `GET /feed/today` response of
// the API's tests: a set with all six card types. services/api/tests/test_feed_fixture_sync.py
// fails when the two copies differ.
//
// The API writes snake_case keys and the app's schema reads camelCase, so the keys are mapped
// first. Only object keys change: the review's `ratings` pairs and the summary's `moved` triples
// stay arrays, with their values as they are.
import response from '../__fixtures__/feed_response.json';
import { feedSetSchema } from '../schema';

const CARD_TYPES = ['concept', 'quiz', 'predict', 'exercise', 'review', 'checkpoint'];

/** `snake_case` → `snakeCase`. */
function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (match) => match.charAt(1).toUpperCase());
}

/** `value` with every object key, at any depth, in camelCase. */
function camelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelize);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [camelKey(key), camelize(item)]),
    );
  }
  return value;
}

/** The keys of each card that the schema dropped (zod strips keys it does not name). */
function droppedKeys(sent: Record<string, unknown>[], kept: object[]): string[][] {
  return sent.map((card, at) => Object.keys(card).filter((key) => !(key in (kept[at] ?? {}))));
}

describe('the API feed response', () => {
  const sent = camelize(response) as { cards: Record<string, unknown>[] };
  const parsed = feedSetSchema.parse(sent);

  it('holds all six card types', () => {
    expect(response.cards.map((card) => card.type).sort()).toEqual(
      [...CARD_TYPES, 'concept'].sort(),
    );
  });

  it('parses with every card kept, in order', () => {
    expect(parsed.cards.map((card) => card.type)).toEqual(response.cards.map((card) => card.type));
  });

  it('keeps the topic, the set number and the summary', () => {
    expect(parsed.topic).toEqual({
      slug: 'strudel',
      title: 'Strudel',
      day: response.topic.day,
      horizonDays: response.topic.horizon_days,
      streak: response.topic.streak,
      progress: response.topic.progress,
    });
    expect(parsed.setNumber).toBe(response.set_number);
    expect(parsed.summary.progressDelta).toBe(response.summary.progress_delta);
    expect(parsed.summary.moved).toEqual(response.summary.moved);
  });

  it('reads every key of each card, its id included', () => {
    expect(droppedKeys(sent.cards, parsed.cards)).toEqual(sent.cards.map(() => []));
    expect(parsed.cards.map((card) => card.id)).toEqual(response.cards.map((card) => card.id));
  });

  it('maps only object keys: arrays and their values stay as sent', () => {
    expect(camelize({ a_b: [['Again', '10 min']], c: [['x_y', 0.5, 1]] })).toEqual({
      aB: [['Again', '10 min']],
      c: [['x_y', 0.5, 1]],
    });
  });
});
