import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { isSettled, useJob, type JobView } from '../topics/useJob';
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
  /** A topic outside the registry: its job proposes sources, which a person approves next. */
  proposed?: boolean;
};

/** The line for the job's status, from a server that does not report the stage. */
function statusLine(status: JobView['status'], proposed: boolean): string {
  if (status === 'running') return copy.pendingTopic.running;
  if (status === 'done') return proposed ? copy.pendingTopic.proposed : copy.pendingTopic.done;
  if (status === 'failed') return copy.pendingTopic.couldNotBuild;
  if (status === 'timeout') return copy.pendingTopic.timeout;
  return copy.pendingTopic.waitingToStart;
}

/**
 * The line under the title for the job's state: by its stage when the server reports it, else by
 * its status. A failure reads a fixed line chosen by the reason, never the reason, which is
 * internal.
 */
function line({ status, stage, ahead = 0, reason }: JobView, proposed: boolean): string {
  if (stage === undefined || status === 'timeout') return statusLine(status, proposed);
  if (stage === 'done') return copy.pendingTopic.done;
  if (stage === 'queued') {
    return ahead >= 1 ? copy.pendingTopic.queuedAhead(ahead) : copy.pendingTopic.queued;
  }
  if (stage === 'failed') {
    return reason === 'invalid_output'
      ? copy.pendingTopic.failed.invalidOutput
      : copy.pendingTopic.failed.other;
  }
  return copy.pendingTopic.stage[stage];
}

/**
 * The Explore tab's card for a topic being built (README.md:163): a violet card with an ink
 * border and hard shadow, the kicker "BUILDING YOUR TREE", the topic's title and a line for its
 * job's state (`useJob`): its place in the queue, then its stage, or why it failed. Screen readers
 * hear the line when it changes. For a `proposed` topic the job proposes its sources, and once it
 * is done the line says the topic waits for approval. `onReady` runs when the job is done and its
 * topic is no longer being built (as before, a topic waiting for a review counts).
 */
export function PendingTopic({ jobId, title, onReady, proposed = false }: PendingTopicProps) {
  const job = useJob(jobId);
  const ready = useEffectEvent(onReady);
  const done = job.status === 'done' && isSettled(job.stage);
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
          <Text style={styles.line}>{line(job, proposed)}</Text>
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
