import { render, screen, within } from '@testing-library/react-native';
import { Flame } from 'lucide-react-native';

import type { Card } from '../../data';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { border, colors, fonts, hardShadow, type } from '../../theme';
import { FeedHeader } from '../FeedHeader';
import { textStyleOf, viewStyleOf } from '../testing/styles';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;
const SIX: Card[] = [concept, quiz, predict, exercise, review, checkpoint];
const HIDDEN = { includeHiddenElements: true };

type HeaderOptions = { cards?: Card[]; index?: number; streak?: number };

/** Renders the header for Strudel day 4 of 14, set 1, with the given cards, index and streak. */
function renderHeader({ cards = SIX, index = 2, streak = 12 }: HeaderOptions = {}) {
  const set = makeSet(streak, cards);
  const strudel = { ...set, topic: { ...set.topic, day: 4, horizonDays: 14 } };
  render(<FeedHeader set={strudel} index={index} streak={streak} />);
}

const segments = () => screen.getAllByTestId('progress-segment');
const fills = () => segments().map((segment) => viewStyleOf(segment).backgroundColor);

describe('FeedHeader text', () => {
  // Regular weight and a 1.55 line height, as the prototype's kicker inherits them (line 58).
  it('shows the kicker in 10-point regular neutral-700 with 0.12em tracking', () => {
    renderHeader();

    expect(textStyleOf(screen.getByText('STRUDEL · DAY 4 OF 14'))).toMatchObject({
      fontFamily: fonts.body,
      fontSize: 10,
      lineHeight: 15.5,
      letterSpacing: 1.2,
      color: colors.neutral[700],
    });
  });

  it('titles the header Today in the screen title style, as a header', () => {
    renderHeader();

    const title = screen.getByRole('header', { name: 'Today' });
    expect(textStyleOf(title)).toMatchObject({ ...type.screenTitle, color: colors.ink });
  });

  it('pads the header 6, 18, 12 with a 10-point gap', () => {
    renderHeader();

    expect(viewStyleOf(screen.getByTestId('feed-header'))).toMatchObject({
      paddingTop: 6,
      paddingHorizontal: 18,
      paddingBottom: 12,
      gap: 10,
    });
  });
});

describe('FeedHeader streak chip', () => {
  // The 1.55 line height the prototype's chip inherits (line 61).
  it('shows the streak count in the 17-point heading font', () => {
    renderHeader({ streak: 12 });

    const count = within(screen.getByTestId('streak-chip')).getByText('12');
    expect(textStyleOf(count)).toMatchObject({
      fontFamily: fonts.heading,
      fontSize: 17,
      lineHeight: 17 * 1.55,
      color: colors.ink,
    });
  });

  it('fills the chip coral with a 1.5 ink border and 4 by 10 padding', () => {
    renderHeader();

    expect(viewStyleOf(screen.getByTestId('streak-chip-face'))).toMatchObject({
      backgroundColor: colors.coral,
      borderWidth: border.strong,
      borderColor: colors.ink,
      paddingVertical: 4,
      paddingHorizontal: 10,
    });
  });

  it('draws a 2-point ink hard shadow as a view behind the chip', () => {
    renderHeader();

    expect(viewStyleOf(screen.getByTestId('streak-chip-shadow'))).toMatchObject({
      position: 'absolute',
      top: hardShadow.small,
      left: hardShadow.small,
      right: -hardShadow.small,
      bottom: -hardShadow.small,
      backgroundColor: colors.ink,
    });
  });

  it('draws a 16-point Flame icon, stroke 1.5, hidden from accessibility', () => {
    renderHeader();

    const chip = screen.getByTestId('streak-chip');
    expect(within(chip).UNSAFE_getAllByType(Flame)).toHaveLength(1);
    const icon = within(chip).getByTestId('streak-icon', HIDDEN);
    expect(icon.props).toMatchObject({
      width: 16,
      height: 16,
      stroke: colors.ink,
      strokeWidth: 1.5,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  it('is one accessible element that speaks the streak', () => {
    renderHeader({ streak: 12 });

    expect(screen.getByTestId('streak-chip').props).toMatchObject({
      accessible: true,
      accessibilityLabel: '12 day streak',
    });
  });
});

describe('FeedHeader progress segments', () => {
  it('fills the first 3 of 6 segments at index 2, each in its card color', () => {
    renderHeader({ index: 2 });

    expect(fills()).toStrictEqual([
      colors.violet,
      colors.coral,
      colors.aqua,
      'transparent',
      'transparent',
      'transparent',
    ]);
  });

  it('fills every segment on the Summary page', () => {
    renderHeader({ index: 6 });

    expect(fills()).toStrictEqual([
      colors.violet,
      colors.coral,
      colors.aqua,
      colors.lime,
      colors.yellow,
      colors.pink,
    ]);
  });

  it('draws 4 equal segments, 6 tall with a 1-point ink border, for a 4-card set', () => {
    renderHeader({ cards: [quiz, exercise, concept, review], index: 0 });

    expect(segments()).toHaveLength(4);
    for (const segment of segments()) {
      expect(viewStyleOf(segment)).toMatchObject({
        flex: 1,
        height: 6,
        borderWidth: border.hairline,
        borderColor: colors.ink,
      });
    }
  });

  it('lays the segments in a row with a 4-point gap', () => {
    renderHeader();

    expect(viewStyleOf(screen.getByRole('progressbar'))).toMatchObject({
      flexDirection: 'row',
      gap: 4,
    });
  });
});

describe('FeedHeader progress accessibility', () => {
  it.each([
    { index: 2, cards: SIX, now: 3, label: '3 of 6 cards done' },
    { index: 6, cards: SIX, now: 6, label: '6 of 6 cards done' },
    { index: 0, cards: [checkpoint], now: 1, label: '1 of 1 cards done' },
  ])('is one progress bar that speaks $label at index $index', ({ index, cards, now, label }) => {
    renderHeader({ cards, index });

    expect(screen.getByRole('progressbar').props).toMatchObject({
      accessible: true,
      accessibilityLabel: label,
      accessibilityValue: { min: 0, max: cards.length, now },
    });
  });

  it('draws no segments for a set with no cards, without throwing', () => {
    renderHeader({ cards: [], index: 0 });

    expect(screen.queryAllByTestId('progress-segment')).toHaveLength(0);
    expect(screen.getByRole('progressbar').props).toMatchObject({
      accessibilityValue: { min: 0, max: 0, now: 0 },
    });
  });
});
