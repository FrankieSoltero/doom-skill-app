// The follow-up card (src/feed/followUp.ts): where a card the server offers after a wrong answer
// goes in the running set (two cards after the answered one, before the checkpoint, never behind
// the learner), how the attempt's reply is read, and how it reaches the installed sink.
import type { Card, FeedSet } from '../../data';
import { logWarning } from '../../log';
import {
  followUpTarget,
  handOverFollowUp,
  installFollowUpSink,
  parseFollowUp,
  placeFollowUp,
  type Placed,
} from '../followUp';
import { useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, predict, checkpoint } = cardsByType;

const store = () => useFeedStore.getState();

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A card as the API serves it: with its server id. */
function served<C extends Card>(card: C, n: number): C {
  return { ...card, id: idOf(n) };
}

const followUp = served(predict, 9);

function apiSet(cards: Card[], over: Partial<FeedSet> = {}): FeedSet {
  return { ...makeSet(0, cards), setNumber: 3, feedDate: '2026-10-01', ...over };
}

/** The follow-up of a wrong answer at card `n` of set 3 of 2026-10-01. */
const placed = (n: number, card: Card = followUp): Placed => ({
  card,
  afterCardId: idOf(n),
  feedDate: '2026-10-01',
  setNumber: 3,
});

const FIVE = [served(quiz, 1), served(concept, 2), served(concept, 3), served(quiz, 4)];

function ids(): (string | undefined)[] {
  return (store().set?.cards ?? []).map((card) => card.id);
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  installFollowUpSink(null);
  jest.mocked(logWarning).mockClear();
});

describe('followUpTarget and placeFollowUp', () => {
  it('places the follow-up two cards after the answered card', () => {
    store().startSet(apiSet(FIVE));
    store().setAnswer(0, { kind: 'choice', picked: 1 });

    expect(followUpTarget(store(), placed(1))).toBe(2);
    placeFollowUp(placed(1));

    expect(ids()).toStrictEqual([idOf(1), idOf(2), idOf(9), idOf(3), idOf(4)]);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('lands before the checkpoint when the answered card is the last card before it', () => {
    store().startSet(apiSet([served(concept, 2), served(quiz, 1), served(checkpoint, 5)]));
    store().setIndex(1);
    store().setAnswer(1, { kind: 'choice', picked: 1 });

    expect(followUpTarget(store(), placed(1))).toBe(2);
    placeFollowUp(placed(1));

    expect(ids()).toStrictEqual([idOf(2), idOf(1), idOf(9), idOf(5)]);
    expect(store().set?.cards[3]?.type).toBe('checkpoint');
  });

  it.each([2, 3])(
    'drops it when the learner is already at or past the target (page %i)',
    (page) => {
      store().startSet(apiSet(FIVE));
      store().setAnswer(0, { kind: 'choice', picked: 1 });
      store().setIndex(page);

      expect(followUpTarget(store(), placed(1))).toBeNull();
      placeFollowUp(placed(1));

      expect(ids()).toStrictEqual([idOf(1), idOf(2), idOf(3), idOf(4)]);
      expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason: 'behind' });
    },
  );

  it.each([
    ['another set', { setNumber: 4 }, 'other_set'],
    ['another day', { feedDate: '2026-10-02' }, 'other_set'],
    ['a demo set, with no date', { feedDate: undefined }, 'other_set'],
  ] as const)('drops it when %s is on screen', (_case, over, reason) => {
    store().startSet(apiSet(FIVE, over));

    expect(followUpTarget(store(), placed(1))).toBeNull();
    placeFollowUp(placed(1));

    expect(store().set?.cards).toHaveLength(4);
    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason });
  });

  it("drops it when another topic's set of the same day and number is on screen", () => {
    const other = { ...makeSet(0, []).topic, slug: 'sql' };
    store().startSet(apiSet([served(quiz, 11), served(concept, 12)], { topic: other }));

    expect(followUpTarget(store(), placed(1))).toBeNull();
    placeFollowUp(placed(1));

    expect(store().set?.cards).toHaveLength(2);
    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason: 'not_in_set' });
  });

  it('drops it when no set is on screen', () => {
    expect(followUpTarget(store(), placed(1))).toBeNull();
    placeFollowUp(placed(1));

    expect(store().set).toBeNull();
    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason: 'other_set' });
  });

  it('does not insert the same follow-up twice when a replayed attempt returns it again', () => {
    store().startSet(apiSet(FIVE));
    store().setAnswer(0, { kind: 'choice', picked: 1 });

    placeFollowUp(placed(1));
    placeFollowUp(placed(1));

    expect(ids()).toStrictEqual([idOf(1), idOf(2), idOf(9), idOf(3), idOf(4)]);
  });

  it('logs no card text', () => {
    const secret = { ...followUp, title: 'secret-marker' };
    store().startSet(apiSet(FIVE, { setNumber: 4 }));

    placeFollowUp(placed(1, secret));

    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});

/** The follow-up as the API serves it, in snake_case. */
const SERVED = {
  id: idOf(9),
  node: 'Speed',
  est_seconds: 30,
  sources: [],
  type: 'quiz',
  title: 'Pick one',
  options: ['One', 'Two'],
  correct: 1,
  explanation: 'Because two.',
};

describe('parseFollowUp', () => {
  it("reads the API's card with the feed's keys", () => {
    expect(parseFollowUp(SERVED)).toStrictEqual({
      id: idOf(9),
      node: 'Speed',
      estSeconds: 30,
      sources: [],
      type: 'quiz',
      title: 'Pick one',
      options: ['One', 'Two'],
      correct: 1,
      explanation: 'Because two.',
    });
  });

  it.each([null, undefined])('reads %s as no follow-up, and logs nothing', (raw) => {
    expect(parseFollowUp(raw)).toBeNull();
    expect(logWarning).not.toHaveBeenCalled();
  });

  it.each([
    ['a card the schema refuses', { ...SERVED, title: '', explanation: 'secret-marker' }],
    ['a card of a type the app does not know', { ...SERVED, type: 'secret-marker' }],
    ['not a card', 'secret-marker'],
  ])('reads %s as none, logging follow_up_dropped and no text', (_case, raw) => {
    expect(parseFollowUp(raw)).toBeNull();

    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason: 'unparsable' });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});

describe('handOverFollowUp', () => {
  const sent = { cardId: idOf(1), feedDate: '2026-10-01', setNumber: 3 };

  it("calls the installed sink with the card and the attempt's card, date and set", () => {
    const sink = jest.fn();
    installFollowUpSink(sink);

    handOverFollowUp(sent, { followUp });

    expect(sink.mock.calls).toStrictEqual([[placed(1)]]);
  });

  it.each([
    ['no follow-up', { followUp: null }],
    ['no reply', undefined],
  ])('calls no sink for %s', (_case, reply) => {
    const sink = jest.fn();
    installFollowUpSink(sink);

    handOverFollowUp(sent, reply);

    expect(sink).not.toHaveBeenCalled();
  });

  it('skips the follow-up when no sink is installed (the demo)', () => {
    expect(() => {
      handOverFollowUp(sent, { followUp });
    }).not.toThrow();
  });

  it('logs a sink that throws by its class name, and does not throw', () => {
    installFollowUpSink(() => {
      throw new RangeError('secret-marker');
    });

    expect(() => {
      handOverFollowUp(sent, { followUp });
    }).not.toThrow();

    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', {
      reason: 'failed',
      kind: 'RangeError',
    });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});
