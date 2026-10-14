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
import { useSuggest, type Suggestion } from '../../src/topics/useSuggest';
import {
  MAX_QUERY_LENGTH,
  useCreateTopic,
  useTopics,
  type CreatedTopic,
} from '../../src/topics/useTopics';
import { border, colors, space, type } from '../../src/theme';

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

/**
 * The learner's topics over the idle line, and one fixed line when they could not be read. A
 * failed re-read keeps the list from the last good read above the line.
 */
function Enrolled({ enrollments }: { enrollments: ReturnType<typeof useEnrollments> }) {
  const failed = enrollments.isError ? (
    <Text testID="explore-my-topics-failed" style={styles.line}>
      {copy.explore.myTopicsFailed}
    </Text>
  ) : null;
  if (enrollments.data === undefined) return failed;
  return (
    <>
      <MyTopics enrollments={enrollments.data} onOpen={openTopic} />
      {failed}
    </>
  );
}

/** A topic the user asked to be built in this visit, and whether its job is done. */
type Pending = CreatedTopic & { jobId: string; ready: boolean };

type SuggestionsProps = { items: Suggestion[]; onRequest: (suggestion: Suggestion) => void };

/** The catalog topics for the query, each with its group chip; a built one is marked and opens. */
function Suggestions({ items, onRequest }: SuggestionsProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.block}>
      {items.map((item) => {
        const built = item.built_slug !== null;
        const group = copy.explore.group[item.group];
        return (
          <Pressable
            key={item.key}
            testID="suggestion-row"
            accessibilityRole="button"
            accessibilityLabel={copy.explore.suggestion(item.label, group, built)}
            onPress={() => {
              if (item.built_slug === null) onRequest(item);
              else openTopic(item.built_slug);
            }}
            style={styles.suggestion}
          >
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.chip}>{group}</Text>
            {built ? <Text style={styles.built}>{copy.explore.suggestBuilt}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

type ResultsProps = {
  search: ReturnType<typeof useTopics>;
  notInCatalog: boolean;
  creating: boolean;
  onCreate: () => void;
};

/** The search's state under the field: a line, the Create action, or the topics found. */
function Results({ search, notInCatalog, creating, onCreate }: ResultsProps) {
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
        {notInCatalog ? <Text style={styles.line}>{copy.explore.notInCatalog}</Text> : null}
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
 * idle line; they are read again when the tab regains focus and on pull to refresh. Catalog
 * suggestions show over the results: a built one opens; another is requested with its key.
 */
export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const search = useTopics(query);
  const suggest = useSuggest(query);
  const request = useCreateTopic();
  const enrollments = useEnrollmentsOnFocus();

  const onCreate = async (text: string, catalogKey?: string) => {
    setFailure(null);
    try {
      const created = await request.create(text, catalogKey);
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
        <Suggestions items={suggest.suggestions} onRequest={(s) => void onCreate(s.label, s.key)} />
        <Results
          search={search}
          notInCatalog={suggest.status === 'ready' && suggest.suggestions.length === 0}
          creating={request.status === 'loading'}
          onCreate={() => void onCreate(query)}
        />
      </ScrollView>
    </TabScreen>
  );
}

/** A suggestion's group chip and built mark: caption text in a hairline ink box. */
const CHIP = {
  ...type.caption,
  color: colors.ink,
  borderColor: colors.ink,
  borderWidth: border.hairline,
  paddingHorizontal: space[2],
  paddingVertical: space[1],
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, gap: space[4], paddingBottom: space[6] },
  block: { gap: space[4] },
  line: { ...type.body, color: colors.neutral[700] },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  label: { ...type.button, color: colors.ink, flex: 1 },
  chip: CHIP,
  built: { ...CHIP, backgroundColor: colors.lime },
});
