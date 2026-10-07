import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorScreen } from '../../../src/components/ErrorScreen';
import { LoadingState } from '../../../src/components/LoadingState';
import { copy } from '../../../src/copy';
import { useProfile } from '../../../src/profile/useProfile';
import { LeaderboardList } from '../../../src/topics/LeaderboardList';
import { useLeaderboard } from '../../../src/topics/useLeaderboard';
import { colors, space, type } from '../../../src/theme';

// Values the theme lacks, as the topic screen has them: the tab screens' side padding
// (src/components/TabScreen.tsx), the minimum touch target and the back icon.
const PADDING_X = 18;
const MIN_TOUCH = 44;
const ICON_SIZE = 22;
const ICON_STROKE = 1.5;

/** Back to the topic screen. */
function goBack(): void {
  router.back();
}

/** The board, the busy line, or the fixed line of a failed load (Retry), as the topic screen. */
function Board({ slug }: { slug: string }) {
  const board = useLeaderboard(slug);
  const profile = useProfile();
  if (board.status === 'loading') return <LoadingState label={copy.loading} />;
  if (board.board !== undefined) {
    return <LeaderboardList board={board.board} optedIn={profile.profile?.leaderboard_opt_in} />;
  }
  if (board.error?.kind === 'notFound') return <ErrorScreen message={copy.topic.notFound} />;
  return (
    <ErrorScreen
      message={copy.leaderboard.loadFailed}
      actionLabel={copy.retry}
      onAction={board.retry}
    />
  );
}

/**
 * A topic's leaderboard, opened from the topic screen: a back button and the header, then the top
 * learners opted in on the topic (`GET /topics/{slug}/leaderboard`), the caller's own rank, and,
 * for a caller not opted in (`useProfile`), how to appear on it. Every failure shows a fixed line.
 */
export default function LeaderboardScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View testID="leaderboard-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.topic.back}
          onPress={goBack}
          style={styles.back}
        >
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {copy.leaderboard.title}
        </Text>
      </View>
      <Board slug={slug} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[2],
    paddingRight: PADDING_X,
    paddingBottom: space[4],
  },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, justifyContent: 'center' },
  title: { ...type.tabTitle, color: colors.ink, flexShrink: 1 },
});
