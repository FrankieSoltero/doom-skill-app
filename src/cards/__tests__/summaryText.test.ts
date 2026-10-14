import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import type { Tree } from '../../topics/useTree';
import { pointsGained, sectionLine, summaryTitle } from '../summaryText';

describe('summaryTitle', () => {
  it.each([
    // The brief's rows.
    { cards: 6, seconds: 540, title: 'Six cards. Nine minutes.' },
    { cards: 12, seconds: 1080, title: 'Twelve cards. Eighteen minutes.' },
    { cards: 24, seconds: 2160, title: '24 cards. 36 minutes.' },
    { cards: 24, seconds: 1080, title: '24 cards. Eighteen minutes.' },
    { cards: 6, seconds: 570, title: 'Six cards. Ten minutes.' },
    { cards: 1, seconds: 60, title: 'One card. One minute.' },
    // The demo's first set: 40 + 30 + 45 + 90 + 20 + 180 seconds.
    { cards: 6, seconds: 405, title: 'Six cards. Seven minutes.' },
    // Cards around the last word, each decided apart from the minutes.
    { cards: 2, seconds: 60, title: 'Two cards. One minute.' },
    { cards: 19, seconds: 60, title: 'Nineteen cards. One minute.' },
    { cards: 20, seconds: 60, title: 'Twenty cards. One minute.' },
    { cards: 21, seconds: 60, title: '21 cards. One minute.' },
    // Minutes are Math.max(1, Math.round(seconds / 60)).
    { cards: 6, seconds: 0, title: 'Six cards. One minute.' },
    { cards: 6, seconds: 29, title: 'Six cards. One minute.' },
    { cards: 6, seconds: 30, title: 'Six cards. One minute.' },
    { cards: 6, seconds: 89, title: 'Six cards. One minute.' },
    { cards: 6, seconds: 90, title: 'Six cards. Two minutes.' },
    { cards: 6, seconds: 1200, title: 'Six cards. Twenty minutes.' },
    { cards: 6, seconds: 1260, title: 'Six cards. 21 minutes.' },
    // No cards cannot occur on a Summary; it reads as digits, and the minutes stay at least one.
    { cards: 0, seconds: 0, title: '0 cards. One minute.' },
  ])('$cards cards, $seconds seconds: $title', ({ cards, seconds, title }) => {
    expect(summaryTitle(cards, seconds)).toBe(title);
  });

  it.each([
    { cards: Number.NaN, seconds: 540, title: '0 cards. Nine minutes.' },
    { cards: Infinity, seconds: 540, title: '0 cards. Nine minutes.' },
    { cards: -3, seconds: 540, title: '0 cards. Nine minutes.' },
    { cards: 6, seconds: Number.NaN, title: 'Six cards. One minute.' },
    { cards: 6, seconds: -Infinity, title: 'Six cards. One minute.' },
    { cards: 6, seconds: -600, title: 'Six cards. One minute.' },
  ])(
    'reads $cards cards and $seconds seconds as 0 where not a count',
    ({ cards, seconds, title }) => {
      expect(summaryTitle(cards, seconds)).toBe(title);
    },
  );

  it('rounds a card count that is not whole', () => {
    expect(summaryTitle(2.4, 60)).toBe('Two cards. One minute.');
    expect(summaryTitle(2.5, 60)).toBe('Three cards. One minute.');
  });
});

describe('pointsGained', () => {
  it.each([
    // The brief's row: a set whose attempts answered 5, 0, 2 and 10.
    { points: 17, text: '+17 points' },
    // A set with no points still says so.
    { points: 0, text: '+0 points' },
    { points: 1, text: '+1 points' },
    { points: Number.NaN, text: '+0 points' },
    { points: -3, text: '+0 points' },
  ])('writes $points as $text', ({ points, text }) => {
    expect(pointsGained(points)).toBe(text);
  });
});

const treeNode = (title: string, milestoneId: string | null) => ({
  id: title,
  slug: title,
  title,
  summary: '',
  estimated_minutes: 5,
  milestone_id: milestoneId,
  mastery: 0,
  unlocked: true,
});
const TREE: Tree = {
  topic: { slug: 'strudel', title: 'Strudel', description: null, status: 'ready', end_state: null },
  milestones: [
    { id: 'm1', position: 1, title: 'Rhythm basics', earned: 12, target: 100 },
    { id: 'm2', position: 2, title: 'Layering', earned: 0, target: 280 },
  ],
  nodes: [treeNode('mini-notation', 'm1'), treeNode('stacking', 'm2'), treeNode('loose', null)],
  edges: [],
};
const { concept, quiz, checkpoint } = cardsByType;
const onNode = (card: Card, node: string): Card => ({ ...card, node }) as Card;

describe('sectionLine', () => {
  it("writes the section of the set's last card: its title, earned and target", () => {
    expect(sectionLine(TREE, [onNode(quiz, 'stacking'), concept])).toBe(
      'Rhythm basics: 12 / 100 points',
    );
  });

  it("reads a checkpoint's section by its milestone's position", () => {
    expect(sectionLine(TREE, [concept, { ...checkpoint, milestone: 2 }])).toBe(
      'Layering: 0 / 280 points',
    );
  });

  it('falls back to the last card that has a section', () => {
    expect(sectionLine(TREE, [concept, onNode(quiz, 'loose'), onNode(quiz, 'unknown')])).toBe(
      'Rhythm basics: 12 / 100 points',
    );
  });

  it('is null without a tree, or when no card has a section', () => {
    expect(sectionLine(undefined, [concept])).toBeNull();
    expect(sectionLine(TREE, [onNode(quiz, 'loose'), { ...checkpoint, milestone: 9 }])).toBeNull();
    expect(sectionLine(TREE, [])).toBeNull();
  });
});
