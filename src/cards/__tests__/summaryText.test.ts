import { progressPercent, summaryTitle } from '../summaryText';

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

describe('progressPercent', () => {
  it.each([
    { progress: 0.34, text: '34%' },
    { progress: 0.345, text: '35%' },
    { progress: 0, text: '0%' },
    { progress: 1, text: '100%' },
    { progress: 1.2, text: '100%' },
    { progress: -0.1, text: '0%' },
    { progress: Number.NaN, text: '0%' },
  ])('writes $progress as $text', ({ progress, text }) => {
    expect(progressPercent(progress)).toBe(text);
  });
});
