import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { copy } from '../copy';
import type { GridRow } from '../feed/exercise';
import { colors, fonts, gridRowColors } from '../theme';
import { GRID_STEPS, playheadColumn } from './beatStep';

// Beat grid values from docs/design/card-feed/README.md:97-101 or, where it is silent, the
// prototype docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html. The theme holds none.
/** Width of the sample label column, README.md:98. */
const LABEL_WIDTH = 26;
/** Size of the label's mono text, prototype line 154. */
const LABEL_SIZE = 10;
/**
 * The label's line height: its 10px size times the prototype's body line height, 1.55, from
 * docs/design/card-feed/reference/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css:108.
 */
const LABEL_LINE_HEIGHT = 15.5;
/** Gap between the label and the cells and between cells, README.md:98 (prototype line 153). */
const CELL_GAP = 2;
/** Height of a cell, README.md:98. */
const CELL_HEIGHT = 14;
/** Gap between rows, prototype line 151. */
const ROW_GAP = 4;
/** Padding around the rows, prototype line 151 ("padding:10px 14px 12px"). */
const PADDING = { top: 10, x: 14, bottom: 12 };
/** Opacity of an empty cell, "paper at 10% opacity", README.md:99. */
const EMPTY_OPACITY = 0.1;
/** Opacity of an empty cell under the playhead, "paper at 35% opacity", README.md:100. */
const PLAYHEAD_OPACITY = 0.35;
/** Vertical scale of a hit under the playhead, `scaleY(1.4)`, README.md:100. */
const PLAYHEAD_HIT_SCALE = 1.4;

const COLUMNS = Array.from({ length: GRID_STEPS }, (_, column) => column);

/** The 16 steps of `row`: a missing entry is no hit, and entries past the 16th are dropped. */
const stepsOf = (row: GridRow): boolean[] => COLUMNS.map((column) => row.hits[column] === true);

/** The look of one cell: hit or not, under the playhead or not, README.md:99-100. */
function cellLook(hit: boolean, underPlayhead: boolean, color: string): ViewStyle {
  if (underPlayhead) return hit ? styles.playheadHit : styles.playheadEmpty;
  return hit ? { backgroundColor: color } : styles.empty;
}

type BeatRowProps = {
  row: GridRow;
  color: string;
  /** The playhead column, or null when stopped. */
  playhead: number | null;
};

/**
 * One sample's line: its label, then 16 cells. Memoized, so it skips a row only when the grid
 * re-renders for a reason other than its rows or the step. While playing, the playhead moves on
 * every step, so every row redraws; and `parseGrid` builds new rows on every edit.
 */
const BeatRow = memo(function BeatRow({ row, color, playhead }: BeatRowProps) {
  return (
    <View testID="beat-grid-row" style={styles.row}>
      <Text
        testID="beat-grid-label"
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[styles.label, { color }]}
      >
        {row.name}
      </Text>
      {stepsOf(row).map((hit, column) => (
        <View
          // Cells are positional: column `column` of the 16 steps.
          key={column}
          testID="beat-grid-cell"
          style={[styles.cell, cellLook(hit, column === playhead, color)]}
        />
      ))}
    </View>
  );
});

type BeatGridProps = {
  /** The rows to draw, in order; only the first four are drawn. */
  rows: GridRow[];
  /** The playing step, wrapped into the 16 columns, or null when stopped. */
  step: number | null;
};

/**
 * The exercise card's step grid, README.md:97-102: one line per row, each a label in the row's
 * color and 16 cells, with a playhead column while playing. It draws what it is given and moves
 * only when its host passes a new `step`. Screen readers read it as one image.
 */
export function BeatGrid({ rows, step }: BeatGridProps) {
  // One row per row color, in order: a fifth row has no color and is not drawn.
  const shown = gridRowColors.flatMap((color, index) => {
    const row = rows[index];
    return row ? [{ row, color }] : [];
  });
  if (shown.length === 0) return null;
  const playhead = playheadColumn(step);
  const label = copy.gridLabel(
    shown.map(({ row }) => copy.gridRow(row.name, stepsOf(row).filter(Boolean).length)),
  );

  return (
    <View
      testID="beat-grid"
      style={styles.grid}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {shown.map(({ row, color }, index) => (
        // Rows are positional: row `index` takes row color `index`.
        <BeatRow key={index} row={row} color={color} playhead={playhead} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: ROW_GAP,
    paddingTop: PADDING.top,
    paddingHorizontal: PADDING.x,
    paddingBottom: PADDING.bottom,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: CELL_GAP },
  label: {
    width: LABEL_WIDTH,
    fontFamily: fonts.mono,
    fontSize: LABEL_SIZE,
    lineHeight: LABEL_LINE_HEIGHT,
  },
  cell: { flex: 1, height: CELL_HEIGHT },
  empty: { backgroundColor: colors.paper, opacity: EMPTY_OPACITY },
  playheadEmpty: { backgroundColor: colors.paper, opacity: PLAYHEAD_OPACITY },
  playheadHit: { backgroundColor: colors.paper, transform: [{ scaleY: PLAYHEAD_HIT_SCALE }] },
});
