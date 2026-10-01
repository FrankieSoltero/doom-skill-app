// The API's feed response against the app's card schema (M3 plan, Task 13). The fixture is a
// copy of services/api/tests/fixtures/feed_response.json, the whole `GET /feed/today` response of
// the API's tests: a set with all six card types. services/api/tests/test_feed_fixture_sync.py
// fails when the two copies differ.
//
// The API writes snake_case keys and the app's schema reads camelCase, so the keys are mapped
// first, by the API source's own mapper (`mapFeed`, tested in apiSource.test.ts).
import response from '../__fixtures__/feed_response.json';
import { mapFeed } from '../mapFeed';
import { feedSetSchema } from '../schema';

const CARD_TYPES = ['concept', 'quiz', 'predict', 'exercise', 'review', 'checkpoint'];

/** The keys of each card that the schema dropped (zod strips keys it does not name). */
function droppedKeys(sent: Record<string, unknown>[], kept: object[]): string[][] {
  return sent.map((card, at) => Object.keys(card).filter((key) => !(key in (kept[at] ?? {}))));
}

describe('the API feed response', () => {
  const sent = mapFeed(response) as { cards: Record<string, unknown>[] };
  const parsed = feedSetSchema.parse(sent);

  it('holds all six card types', () => {
    expect(response.cards.map((card) => card.type).sort()).toEqual(
      [...CARD_TYPES, 'concept'].sort(),
    );
  });

  it('parses with every card kept, in order', () => {
    expect(parsed.cards.map((card) => card.type)).toEqual(response.cards.map((card) => card.type));
  });

  it('keeps the topic, the set number, its date and the summary', () => {
    expect(parsed.feedDate).toBe(response.feed_date);
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
    expect(parsed.summary.progressAfter).toBe(response.summary.progress_after);
    expect(parsed.summary.moved).toEqual(response.summary.moved);
  });

  it('reads every key of each card, its id included', () => {
    expect(droppedKeys(sent.cards, parsed.cards)).toEqual(sent.cards.map(() => []));
    expect(parsed.cards.map((card) => card.id)).toEqual(response.cards.map((card) => card.id));
  });
});
