import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { useJob, type JobView } from '../topics/useJob';
import { border, colors, hardShadow, space, type } from '../theme';

// The card's values from docs/design/card-feed/README.md:163 and CardFrame, which the theme lacks.
/** Inner padding, as every card's (CardFrame, README.md:46). */
const CARD_PADDING = 20;

type PendingTopicProps = {
  /** The topic's ingestion job, polled while the card is on a focused screen. */
  jobId: string;
  /** The topic's title, from the topic request's answer. */
  title: string;
  /** Called once, when the job is done. */
  onReady: () => void;
};

/** The line under the title for the job's state. Never the job's own reason, which is internal. */
function statusLine(status: JobView['status']): string {
  if (status === 'running') return copy.pendingTopic.running;
  if (status === 'done') return copy.pendingTopic.done;
  if (status === 'failed') return copy.pendingTopic.failed;
  if (status === 'timeout') return copy.pendingTopic.timeout;
  return copy.pendingTopic.queued;
}

/**
 * The Explore tab's card for a topic being built (README.md:163): a violet card with an ink
 * border and hard shadow, the kicker "BUILDING YOUR TREE", the topic's title and a line for its
 * job's state (`useJob`). Screen readers hear the line when it changes.
 */
export function PendingTopic({ jobId, title, onReady }: PendingTopicProps) {
  const { status } = useJob(jobId);
  const ready = useEffectEvent(onReady);
  const done = status === 'done';
  useEffect(() => {
    if (done) ready();
  }, [done]);

  return (
    <View testID="pending-topic" style={styles.frame}>
      <View style={styles.shadow} />
      <View testID="pending-topic-body" style={styles.body}>
        <Text style={styles.kicker}>{copy.pendingTopic.kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        <View accessibilityLiveRegion="polite">
          <Text style={styles.line}>{statusLine(status)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { marginRight: hardShadow.card, marginBottom: hardShadow.card },
  shadow: {
    position: 'absolute',
    top: hardShadow.card,
    left: hardShadow.card,
    right: -hardShadow.card,
    bottom: -hardShadow.card,
    backgroundColor: colors.ink,
  },
  body: {
    backgroundColor: colors.violet,
    borderWidth: border.strong,
    borderColor: colors.ink,
    padding: CARD_PADDING,
    gap: space[2],
  },
  kicker: { ...type.kicker, color: colors.ink },
  title: { ...type.screenTitle, color: colors.ink },
  line: { ...type.caption, color: colors.ink },
});
