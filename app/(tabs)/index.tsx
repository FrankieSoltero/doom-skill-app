import { StyleSheet, View } from 'react-native';

import { FeedScreen } from '../../src/components/FeedScreen';
import { cardSource } from '../../src/data';
import { useActiveTopic } from '../../src/feed/useActiveTopic';
import { colors } from '../../src/theme';

/**
 * The Today tab, the `/` route: the card feed over the app's card source, which asks for the
 * active topic. Until the stored active topic has been read, only the paper ground shows, so the
 * feed never asks without it. The feed is keyed by the active topic: choosing another one starts
 * the feed again (setting it also clears the feed store, so the new feed asks for a fresh set).
 */
export default function TodayScreen() {
  const { slug, loaded } = useActiveTopic();
  if (!loaded) return <View testID="today-waiting" style={styles.waiting} />;
  return <FeedScreen key={slug ?? ''} source={cardSource} />;
}

const styles = StyleSheet.create({
  waiting: { flex: 1, backgroundColor: colors.paper },
});
