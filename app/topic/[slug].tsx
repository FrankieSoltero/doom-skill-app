import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/errors';
import { ErrorScreen } from '../../src/components/ErrorScreen';
import { LoadingState } from '../../src/components/LoadingState';
import { milestoneColor } from '../../src/components/milestoneColor';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { copy } from '../../src/copy';
import { useEnroll } from '../../src/topics/useEnroll';
import { useTopic, type TopicDetail } from '../../src/topics/useTopic';
import { border, colors, space, type } from '../../src/theme';

// Values the theme lacks: the tab screens' side padding (src/components/TabScreen.tsx), the
// minimum touch target, and the milestone number square (docs/design/card-feed/README.md:158).
const PADDING_X = 18;
const MIN_TOUCH = 44;
const NUMBER_SIZE = 26;
const ICON_SIZE = 22;
const ICON_STROKE = 1.5;

/** The line for a failed enrollment: never the server's text. */
function enrollFailure(error: unknown): string {
  return error instanceof ApiError && error.kind === 'conflict'
    ? copy.topic.notReady
    : copy.topic.enrollFailed;
}

/** Start: enrolls, then opens the Today tab, which starts the topic. */
function StartButton({ slug }: { slug: string }) {
  const enrollment = useEnroll(slug);
  const [failure, setFailure] = useState<string | null>(null);
  const starting = enrollment.status === 'loading';
  const start = async () => {
    setFailure(null);
    try {
      await enrollment.enroll();
      router.navigate('/');
    } catch (error) {
      setFailure(enrollFailure(error));
    }
  };

  return (
    <View style={styles.section}>
      {failure === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.body}>{failure}</Text>
        </View>
      )}
      <PrimaryButton
        label={starting ? copy.topic.starting : copy.topic.start}
        onPress={() => void start()}
        disabled={starting}
      />
    </View>
  );
}

/** One milestone: its number in a square of its color, and its title. */
function MilestoneLine({ position, title }: { position: number; title: string }) {
  return (
    <View
      style={styles.milestone}
      accessible
      accessibilityLabel={copy.topic.milestone(position, title)}
    >
      <View
        testID={`milestone-number-${String(position)}`}
        style={[styles.number, { backgroundColor: milestoneColor(position) }]}
      >
        <Text style={styles.numberText}>{String(position)}</Text>
      </View>
      <Text style={styles.milestoneTitle}>{title}</Text>
    </View>
  );
}

/** The topic: kicker, title, end state, milestones, then Start, or why it cannot start yet. */
function TopicContent({ topic }: { topic: TopicDetail }) {
  const ready = topic.status === 'ready' && topic.milestones.length > 0;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>{copy.topic.kicker}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {topic.title}
      </Text>
      {topic.end_state === null ? null : (
        <View style={styles.section}>
          <Text style={styles.kicker}>{copy.topic.endState}</Text>
          <Text style={styles.body}>{topic.end_state}</Text>
        </View>
      )}
      {topic.milestones.length === 0 ? null : (
        <View style={styles.section}>
          <Text style={styles.kicker}>{copy.topic.milestones}</Text>
          {topic.milestones.map((milestone) => (
            <MilestoneLine
              key={milestone.id}
              position={milestone.position}
              title={milestone.title}
            />
          ))}
        </View>
      )}
      {ready ? (
        <StartButton slug={topic.slug} />
      ) : (
        <Text style={styles.body}>{copy.topic.notReady}</Text>
      )}
    </ScrollView>
  );
}

/**
 * A topic's detail, opened from Explore: a back button, then the topic's title, end state and
 * milestones (`GET /topics/{slug}`) and Start, which enrolls (`useEnroll`) and opens the Today
 * tab on the new active topic. A topic still being built shows why it cannot start; a failed load
 * shows Retry, and a missing topic says so. Every failure shows a fixed line.
 */
export default function TopicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const detail = useTopic(slug);
  let body;
  if (detail.status === 'loading') body = <LoadingState label={copy.loading} />;
  else if (detail.topic !== undefined) body = <TopicContent topic={detail.topic} />;
  else if (detail.error?.kind === 'notFound') body = <ErrorScreen message={copy.topic.notFound} />;
  else {
    body = (
      <ErrorScreen
        message={copy.topic.loadFailed}
        actionLabel={copy.retry}
        onAction={detail.retry}
      />
    );
  }

  return (
    <View testID="topic-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.topic.back}
        onPress={() => {
          router.back();
        }}
        style={styles.back}
      >
        <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink} />
      </Pressable>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, justifyContent: 'center', marginLeft: space[2] },
  content: { paddingHorizontal: PADDING_X, paddingBottom: space[8], gap: space[6] },
  section: { gap: space[3] },
  kicker: { ...type.kicker, color: colors.neutral[700] },
  title: { ...type.tabTitle, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  number: {
    width: NUMBER_SIZE,
    height: NUMBER_SIZE,
    borderWidth: border.strong,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...type.button, color: colors.ink },
  milestoneTitle: { ...type.body, color: colors.ink, flexShrink: 1 },
});
