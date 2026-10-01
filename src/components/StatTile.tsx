import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '../theme';

// Stat tile values from the prototype, docs/design/card-feed/reference/DoomSkill Card Feed
// v2.dc.html:250 (`padding:10px 12px`), which the theme does not hold.
/** Inner padding, top and bottom. */
export const TILE_PADDING_Y = 10;
/** Inner padding, left and right. */
const TILE_PADDING_X = 12;

type StatTileProps = {
  /** The number shown large, already formatted ("13", "34%"). */
  value: string;
  /** The line under it ("day streak"). */
  label: string;
  /** The tile's fill, a theme color. */
  fill: string;
};

/**
 * One of the Summary's two stat tiles (docs/design/card-feed/README.md:147-149): a filled block
 * with the value in the stat style over a caption, both in ink whatever the card's text color, as
 * the prototype draws them. It shares its row equally with the other tile, and reads as one
 * element to a screen reader.
 */
export function StatTile({ value, label, fill }: StatTileProps) {
  return (
    <View testID="stat-tile" accessible style={[styles.tile, { backgroundColor: fill }]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, paddingVertical: TILE_PADDING_Y, paddingHorizontal: TILE_PADDING_X },
  value: { ...type.stat, color: colors.ink },
  label: { ...type.caption, color: colors.ink },
});
