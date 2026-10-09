import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/errors';
import { LoadingState } from '../../src/components/LoadingState';
import { OutlineButton } from '../../src/components/OutlineButton';
import { PendingTopic } from '../../src/components/PendingTopic';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { SearchField } from '../../src/components/SearchField';
import { TabScreen } from '../../src/components/TabScreen';
import { TopicRow } from '../../src/components/TopicRow';
import { copy } from '../../src/copy';
import { MyTopics } from '../../src/topics/MyTopics';
import { ENROLLMENTS_KEY } from '../../src/topics/useChoose';
import { useEnrollments } from '../../src/topics/useEnrollments';
import {
  MAX_QUERY_LENGTH,
  useCreateTopic,
  useTopics,
  type CreatedTopic,
} from '../../src/topics/useTopics';
import { colors, space, type } from '../../src/theme';

/** Opens a topic's detail screen. */
function openTopic(slug: string): void {
  router.push({ pathname: '/topic/[slug]', params: { slug } });
}

/** The fixed line for a failed topic request: never the server's text. */
function createFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) return copy.explore.notAvailable;
  if (error instanceof ApiError && error.kind === 'rateLimited') return copy.explore.limit;
  return copy.explore.createFailed;
}

/**
 * The learner's enrollments, read again each time the tab regains focus. The first focus (the
 * mount) does not mark them stale: the first read covers it.
 */
function useEnrollmentsOnFocus() {
  const cache = useQueryClient();
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void cache.invalidateQueries({ queryKey: ENROLLMENTS_KEY });
      focusedBefore.current = true;
    }, [cache]),
  );
  return useEnrollments();
}

/** The learner's topics over the idle line, or one fixed line when they could not be read. */
function Enrolled({ enrollments }: { enrollments: ReturnType<typeof useEnrollments> }) {
  if (enrollments.isError) {
    return (
      <Text testID="explore-my-topics-failed" style={styles.line}>
        {copy.explore.myTopicsFailed}
      </Text>
    );
  }
  return <MyTopics enrollments={enrollments.data ?? []} onOpen={openTopic} />;
}

/** A topic the user asked to be built in this visit, and whether its job is done. */
type Pending = CreatedTopic & { jobId: string; ready: boolean };

type ResultsProps = {
  search: ReturnType<typeof useTopics>;
  creating: boolean;
  onCreate: () => void;
};

/** The search's state under the field: a line, the Create action, or the topics found. */
function Results({ search, creating, onCreate }: ResultsProps) {
  if (search.status === 'idle') return <Text style={styles.line}>{copy.explore.idle}</Text>;
  if (search.status === 'loading') return <LoadingState label={copy.explore.searching} />;
  if (search.status === 'error') {
    return (
      <View style={styles.block}>
        <Text style={styles.line}>{copy.explore.searchFailed}</Text>
        <OutlineButton label={copy.retry} onPress={search.retry} />
      </View>
    );
  }
  if (search.topics.length === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.line}>{copy.explore.noMatch}</Text>
        <PrimaryButton
          label={creating ? copy.explore.creating : copy.explore.create}
          onPress={onCreate}
          disabled={creating}
        />
      </View>
    );
  }
  return (
    <View>
      {search.topics.map((topic) => (
        <TopicRow
          key={topic.slug}
          topic={topic}
          {...(topic.status === 'ready'
            ? {
                onPress: () => {
                  openTopic(topic.slug);
                },
              }
            : {})}
        />
      ))}
    </View>
  );
}

/**
 * The Explore tab (README.md:161-164): the search field over `GET /topics?q=`, then the search's
 * state. A query with no match offers Create (`POST /topics`): a topic that exists opens; a new
 * one shows its building card, polled until its job is done, when the card opens the topic.
 * A refused request shows one fixed line ("Not available yet", the pending limit, or a failure).
 * Only a ready topic's row opens. Before anything is typed, the learner's topics show over the
 * idle line; they are read again when the tab regains focus and on pull to refresh.
 */
export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const search = useTopics(query);
  const request = useCreateTopic();
  const enrollments = useEnrollmentsOnFocus();

  const onCreate = async () => {
    setFailure(null);
    try {
      const created = await request.create(query);
      if (created.jobId === null) {
        openTopic(created.slug);
        return;
      }
      setPending({ ...created, jobId: created.jobId, ready: false });
    } catch (error) {
      setFailure(createFailure(error));
    }
  };

  return (
    <TabScreen testID="explore-screen" title={copy.explore.title}>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={copy.explore.searchPlaceholder}
        label={copy.explore.searchLabel}
        maxLength={MAX_QUERY_LENGTH}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={enrollments.isRefetching}
            onRefresh={() => void enrollments.refetch()}
          />
        }
      >
        {pending === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.explore.openTopic(pending.title)}
            accessibilityState={{ disabled: !pending.ready }}
            disabled={!pending.ready}
            onPress={() => {
              openTopic(pending.slug);
            }}
          >
            <PendingTopic
              jobId={pending.jobId}
              title={pending.title}
              proposed={pending.status === 'proposed'}
              onReady={() => {
                setPending({ ...pending, ready: true });
              }}
            />
          </Pressable>
        )}
        {failure === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.line}>{failure}</Text>
          </View>
        )}
        {search.status === 'idle' ? <Enrolled enrollments={enrollments} /> : null}
        <Results
          search={search}
          creating={request.status === 'loading'}
          onCreate={() => void onCreate()}
        />
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: space[4], paddingBottom: space[6] },
  block: { gap: space[4] },
  line: { ...type.body, color: colors.neutral[700] },
});
