import { FlatList, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, colors, space, type } from '../theme';
import type { Leaderboard } from './useLeaderboard';

// Values the theme lacks: the tab screens' side padding (src/components/TabScreen.tsx), as the
// topic screen uses it, and the minimum touch target, which a row's height keeps for readability.
const PADDING_X = 18;
const MIN_ROW = 44;

type Entry = Leaderboard['entries'][number];

type LeaderboardListProps = {
  board: Leaderboard;
  /** Whether the caller is opted in; `undefined` while the profile loads or after it failed. */
  optedIn: boolean | undefined;
};

/**
 * One learner on the board: `#rank`, their name, their level after it from Level 2 (L14), and
 * their points. A long name is cut, never the level.
 */
function Row({ entry }: { entry: Entry }) {
  return (
    <View testID="leaderboard-row" accessible accessibilityRole="text" style={styles.row}>
      <Text style={styles.rank}>{copy.leaderboard.rank(entry.rank)}</Text>
      <View style={styles.who}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.display_name}
        </Text>
        {entry.level > 1 ? (
          <Text style={styles.level}>{copy.levels.byline(entry.level)}</Text>
        ) : null}
      </View>
      <Text style={styles.points}>{copy.leaderboard.points(entry.points)}</Text>
    </View>
  );
}

/** The caller's line, then the opt-in line when the caller is known not to be opted in. */
function CallerLines({ board, optedIn }: LeaderboardListProps) {
  return (
    <View style={styles.footer}>
      <Text style={styles.body}>
        {board.me === null
          ? copy.leaderboard.youNone
          : copy.leaderboard.you(board.me.rank, board.me.points)}
      </Text>
      {optedIn === false ? <Text style={styles.note}>{copy.leaderboard.optIn}</Text> : null}
    </View>
  );
}

/**
 * A topic's board: a row per opted-in learner (or the empty line), then the caller's line and,
 * for a caller not opted in, the line that says how to appear on it.
 */
export function LeaderboardList({ board, optedIn }: LeaderboardListProps) {
  return (
    <FlatList
      data={board.entries}
      keyExtractor={(entry) => `${String(entry.rank)}-${entry.display_name}`}
      renderItem={({ item }) => <Row entry={item} />}
      ListEmptyComponent={<Text style={styles.body}>{copy.leaderboard.empty}</Text>}
      ListFooterComponent={<CallerLines board={board} optedIn={optedIn} />}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: PADDING_X, paddingBottom: space[8] },
  row: {
    minHeight: MIN_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderBottomWidth: border.hairline,
    borderColor: colors.ink,
  },
  rank: { ...type.button, color: colors.ink },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  name: { ...type.body, color: colors.ink, flexShrink: 1 },
  level: { ...type.body, color: colors.ink },
  points: { ...type.body, color: colors.neutral[700] },
  footer: { gap: space[2], paddingTop: space[6] },
  body: { ...type.body, color: colors.ink },
  note: { ...type.body, color: colors.neutral[700] },
});
