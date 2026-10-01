import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import type { TopicSummary } from '../topics/useTopics';
import { border, colors, space, type } from '../theme';

/** Minimum touch target, from the plan's accessibility rule. */
const MIN_TOUCH = 44;

type TopicRowProps = {
  topic: Pick<TopicSummary, 'title' | 'status'>;
  /** Opens the topic. Without it the row is shown but cannot be pressed. */
  onPress?: () => void;
};

/** The meta line and tag fill for a topic's status. */
function statusLook(status: TopicSummary['status']): { label: string; fill: string } {
  if (status === 'ready') return { label: copy.explore.ready, fill: colors.lime };
  if (status === 'failed') return { label: copy.explore.failed, fill: colors.coral };
  return { label: copy.explore.building, fill: colors.yellow };
}

/**
 * One topic in the Explore tab's list (README.md:164): its title, and a tag with a 1-point ink
 * border naming its status, filled by status. A row that can be opened is a button
 * named after the topic; one that cannot is plain text.
 */
export function TopicRow({ topic, onPress }: TopicRowProps) {
  const look = statusLook(topic.status);
  const content = (
    <>
      <Text style={styles.title}>{topic.title}</Text>
      <View style={[styles.tag, { backgroundColor: look.fill }]}>
        <Text style={styles.tagText}>{look.label}</Text>
      </View>
    </>
  );

  if (onPress === undefined) {
    return (
      <View testID="topic-row" style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID="topic-row"
      accessibilityRole="button"
      accessibilityLabel={copy.explore.openTopic(topic.title)}
      onPress={onPress}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.divider,
  },
  title: { ...type.button, color: colors.ink, flexShrink: 1 },
  tag: {
    borderWidth: border.hairline,
    borderColor: colors.ink,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  tagText: { ...type.caption, color: colors.ink },
});
