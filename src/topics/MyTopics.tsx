/**
 * The learner's enrollments on Explore before anything is typed (my-topics plan Task 3): the
 * `My topics` heading, then one row per enrollment in `orderEnrollments` order. A row shows the
 * topic's title, its level badge (decision T1: the levels row's current chip, yellow ground and
 * ink text) and its progress as a whole percent; a completed enrollment shows the tick instead
 * (decision T5: drawn like the badge on the lime ground). Each row is one button that hands its
 * slug to `onOpen`; the caller (Explore) owns the navigation and the reading of the list.
 */
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, colors, space, type } from '../theme';
import type { Enrollment } from './useEnrollments';

/** Minimum touch target, from the plan's accessibility rule (as the levels row's chips). */
const MIN_TOUCH = 44;

/** When an enrollment was last active, as epoch ms: when studied, else when it was started. */
function lastActive(e: Enrollment): number {
  return Date.parse(e.last_studied_at ?? e.started_at);
}

/**
 * The enrollments in the list's order: completed ones last; within each group the most recently
 * studied first (a never-studied one by when it was started); a tie by slug. The input is not
 * changed.
 */
export function orderEnrollments(list: readonly Enrollment[]): Enrollment[] {
  return [...list].sort((a, b) => {
    const done = Number(a.status === 'completed') - Number(b.status === 'completed');
    if (done !== 0) return done;
    const recent = lastActive(b) - lastActive(a);
    if (recent !== 0) return recent;
    return a.topic_slug < b.topic_slug ? -1 : a.topic_slug > b.topic_slug ? 1 : 0;
  });
}

type RowProps = { enrollment: Enrollment; onOpen: (slug: string) => void };

/** One enrollment's row (see the module comment). */
function Row({ enrollment, onOpen }: RowProps) {
  const { topic_slug: slug, topic_title: title, level } = enrollment;
  const completed = enrollment.status === 'completed';
  const percent = copy.explore.progress(Math.round(enrollment.progress * 100));
  const state = completed ? copy.explore.completed : percent;
  return (
    <Pressable
      testID={`my-topic-${slug}`}
      accessibilityRole="button"
      accessibilityLabel={copy.explore.rowLabel(title, level, state)}
      onPress={() => {
        onOpen(slug);
      }}
      style={styles.row}
    >
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <View testID={`my-topic-${slug}-badge`} style={[styles.chip, styles.badge]}>
        <Text style={styles.badgeText}>{copy.levels.badge(level)}</Text>
      </View>
      {completed ? (
        <View testID={`my-topic-${slug}-tick`} style={[styles.chip, styles.tick]}>
          <Text accessibilityLabel={copy.explore.completed} style={styles.small}>
            {copy.explore.tick}
          </Text>
        </View>
      ) : (
        <Text style={styles.small}>{percent}</Text>
      )}
    </Pressable>
  );
}

/** The list (see the module comment); nothing for no enrollments. */
export function MyTopics({
  enrollments,
  onOpen,
}: {
  enrollments: readonly Enrollment[];
  onOpen: (slug: string) => void;
}): ReactElement | null {
  if (enrollments.length === 0) return null;
  return (
    <View testID="explore-my-topics" style={styles.list}>
      <Text accessibilityRole="header" style={styles.heading}>
        {copy.explore.myTopics}
      </Text>
      {orderEnrollments(enrollments).map((e) => (
        <Row key={e.topic_slug} enrollment={e} onOpen={onOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
  heading: { ...type.button, color: colors.ink },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  title: { ...type.body, flex: 1, color: colors.ink },
  chip: {
    justifyContent: 'center',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  badge: { backgroundColor: colors.yellow },
  badgeText: { ...type.button, color: colors.ink },
  tick: { backgroundColor: colors.lime },
  small: { ...type.small, color: colors.ink },
});
