import { StyleSheet, View } from 'react-native';

import { FeedScreen } from '../../src/components/FeedScreen';
import { cardSource } from '../../src/data';
import { useActiveTopic } from '../../src/feed/useActiveTopic';
import { colors } from '../../src/theme';

/**
 * The Today tab, the `/` route: the card feed over the app's card source, which asks for the
 * active topic. Until the stored active topic has been read, only the paper ground shows, so the
 * feed never asks without it. The feed is keyed by the active topic and its refresh count:
 * choosing another topic, or refreshing the active topic's feed after a placement change
 * (`refreshFeed`), starts the feed again (both also clear the feed store, so it asks for a set).
 */
export default function TodayScreen() {
  const { slug, loaded, refreshes } = useActiveTopic();
  if (!loaded) return <View testID="today-waiting" style={styles.waiting} />;
  return <FeedScreen key={`${slug ?? ''}:${String(refreshes)}`} source={cardSource} />;
}

const styles = StyleSheet.create({
  waiting: { flex: 1, backgroundColor: colors.paper },
});
