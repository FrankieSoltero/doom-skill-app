// The Summary's height budget: the card's fixed heights, summed from the constants its parts draw
// with, must fit the card's content box on the reference device in every state. A change that
// pushes the Summary past its page fails here.
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';

import { BAR_HEIGHT, ROW_GAP } from '../../components/MasteryRow';
import { BUTTON_HEIGHT as OUTLINE_HEIGHT } from '../../components/OutlineButton';
import { BUTTON_HEIGHT as PRIMARY_HEIGHT } from '../../components/PrimaryButton';
import { TILE_PADDING_Y } from '../../components/StatTile';
import type { FeedSet } from '../../data';
import { useFeedStore } from '../../feed/store';
import type { NextSetStatus } from '../../feed/useFeedSession';
import { space, type } from '../../theme';
import { ACTIONS_GAP } from '../SummaryActions';
import {
  MASTERY_GAP,
  MAX_MASTERY_ROWS,
  POINTS_LINE_HEIGHT,
  SummaryCard,
  TITLE_LINES,
} from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

/**
 * The card body's content box on the 390x844 reference device, from the task 28 review: screen
 * 844, less the top inset 47, the feed header 74.5 and the tab bar 82, is a pager of 640.5; a page
 * is 34 less (606.5); its padding (6 + 14) leaves a card of 586.5; the border (2 x 1.5) and the
 * card padding (2 x 20) leave 543.5.
 */
const CONTENT_BOX = 543.5;
/**
 * The line height of a text style that sets none (the kicker): Barlow's `hhea` ascent and descent
 * are 1000 and 200 per 1000 units, so a line is 1.2 times the font size.
 */
const NATURAL_LINE = 1.2;
/** The card body's children: kicker row, title, tiles, mastery list, spacer, footer, actions. */
const BODY_CHILDREN = 7;

/**
 * The foot's height: the button row, as tall as its taller button, and a status line over it for
 * `none` and `error`.
 */
function actionsHeight(status: NextSetStatus): number {
  const line = status === 'none' || status === 'error' ? type.body.lineHeight + ACTIONS_GAP : 0;
  return line + Math.max(PRIMARY_HEIGHT, OUTLINE_HEIGHT);
}

/** The Summary's content height in `status`, with a footer of `footerLines` lines. */
function summaryHeight(status: NextSetStatus, footerLines: 1 | 2): number {
  const kicker = type.kicker.fontSize * NATURAL_LINE;
  const title = TITLE_LINES * type.summaryTitle.lineHeight;
  const tiles = type.stat.lineHeight + type.caption.lineHeight + 2 * TILE_PADDING_Y;
  const masteryRow = type.small.lineHeight + ROW_GAP + BAR_HEIGHT;
  const mastery = type.caption.lineHeight + MAX_MASTERY_ROWS * (MASTERY_GAP + masteryRow);
  const footer = footerLines * type.small.lineHeight;
  const gaps = (BODY_CHILDREN - 1) * space[4];
  return kicker + title + tiles + mastery + footer + actionsHeight(status) + gaps;
}

describe('the Summary height budget', () => {
  it.each([
    { status: 'idle', footerLines: 1, height: 472.6 },
    { status: 'idle', footerLines: 2, height: 491.6 },
    { status: 'loading', footerLines: 2, height: 491.6 },
    { status: 'none', footerLines: 1, height: 505.8 },
    { status: 'none', footerLines: 2, height: 524.8 },
    { status: 'error', footerLines: 1, height: 505.8 },
    { status: 'error', footerLines: 2, height: 524.8 },
  ] as const)(
    '$status with a $footerLines-line footer: $height points, inside 543.5',
    ({ status, footerLines, height }) => {
      const sum = summaryHeight(status, footerLines);

      expect(sum).toBeCloseTo(height, 5);
      expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
    },
  );

  it('the card body has the children the budget counts, and no more mastery rows than it counts', () => {
    const moved: FeedSet['summary']['moved'] = [
      ['A', 0, 0.1],
      ['B', 0, 0.2],
      ['C', 0, 0.3],
      ['D', 0, 0.4],
      ['E', 0, 0.5],
    ];
    render(
      createElement(SummaryCard, {
        set: summarySet(moved),
        active: true,
        onKeepGoing: jest.fn(),
        onViewTree: jest.fn(),
        nextSetStatus: 'error',
      }),
    );

    expect(MAX_MASTERY_ROWS).toBe(3);
    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(screen.getAllByTestId('mastery-bar')).toHaveLength(MAX_MASTERY_ROWS);
  });
});

// The points line ("+3 points") sits under the title in the title's own group, so it adds its
// line and margin (`POINTS_LINE_HEIGHT`) and no gap of the card body.
describe('the Summary height budget with the points line', () => {
  it.each([
    { status: 'idle', footerLines: 2, height: 508.6 },
    { status: 'none', footerLines: 2, height: 541.8 },
    { status: 'error', footerLines: 2, height: 541.8 },
  ] as const)(
    '$status with a $footerLines-line footer: $height points, inside 543.5',
    ({ status, footerLines, height }) => {
      const sum = summaryHeight(status, footerLines) + POINTS_LINE_HEIGHT;

      expect(sum).toBeCloseTo(height, 5);
      expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
    },
  );

  it('the line is as tall as the budget counts, and the card body keeps its children', () => {
    useFeedStore.setState({ pointsEarned: 3 });
    render(
      createElement(SummaryCard, {
        set: summarySet(),
        active: false,
        onKeepGoing: jest.fn(),
        onViewTree: jest.fn(),
        nextSetStatus: 'error',
      }),
    );

    const style = StyleSheet.flatten(screen.getByTestId('summary-points').props.style) as {
      lineHeight: number;
      marginTop?: number;
    };
    expect(style.lineHeight + (style.marginTop ?? 0)).toBe(POINTS_LINE_HEIGHT);
    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
  });
});
