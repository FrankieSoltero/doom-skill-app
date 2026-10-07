import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { requireApi } from '../../src/api/query';
import { LoadingState } from '../../src/components/LoadingState';
import { OutlineButton } from '../../src/components/OutlineButton';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { markInboxSeen } from '../../src/data/qa';
import { kindOf } from '../../src/feed/outboxQueue';
import { logWarning } from '../../src/log';
import { INBOX_KEY, useInbox } from '../../src/qa/useInbox';
import { colors, space, type } from '../../src/theme';

/** The inbox's state under the title: a busy line, the error with Retry, the empty line or the lists. */
function Inbox({ inbox }: { inbox: ReturnType<typeof useInbox> }) {
  if (inbox.status === 'loading') return <LoadingState label={copy.loading} />;
  if (inbox.status === 'error' || inbox.inbox === undefined) {
    return (
      <View style={styles.block}>
        <Text style={styles.line}>{copy.qa.inboxFailed}</Text>
        <OutlineButton label={copy.retry} onPress={inbox.retry} />
      </View>
    );
  }
  if (inbox.inbox.toAnswer.length === 0 && inbox.inbox.answered.length === 0) {
    return <Text style={styles.line}>{copy.qa.inboxEmpty}</Text>;
  }
  // The questions to answer and the answers to the learner's questions: Task 11 fills this.
  return <View testID="inbox-lists" />;
}

/**
 * The Questions tab (M10 plan Q, spec 3.4): the learner's inbox. Each time the screen gains focus
 * it marks the inbox seen (`POST /questions/inbox/seen`), which clears the tab's badge, and then
 * reads the inbox again. A failed mark is logged by its kind and changes nothing on screen.
 */
export default function QuestionsScreen() {
  const inbox = useInbox();
  const cache = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      const markSeen = async () => {
        try {
          await markInboxSeen(requireApi());
          // A read still on its way was asked before the mark and would count what was just seen.
          await cache.cancelQueries({ queryKey: INBOX_KEY });
          await cache.invalidateQueries({ queryKey: INBOX_KEY });
        } catch (error) {
          logWarning('inbox_seen_failed', { kind: kindOf(error) });
        }
      };
      void markSeen();
    }, [cache]),
  );

  return (
    <TabScreen testID="questions-screen" title={copy.qa.inboxTitle}>
      <Inbox inbox={inbox} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[4] },
  line: { ...type.body, color: colors.neutral[700] },
});
