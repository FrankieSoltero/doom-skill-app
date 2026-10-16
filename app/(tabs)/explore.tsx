import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/errors';
import { LoadingState } from '../../src/components/LoadingState';
import { PendingTopic } from '../../src/components/PendingTopic';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { SearchField } from '../../src/components/SearchField';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { MyTopics } from '../../src/topics/MyTopics';
import { ENROLLMENTS_KEY } from '../../src/topics/useChoose';
import { useEnrollments } from '../../src/topics/useEnrollments';
import { useExploreResults, type ExploreRow } from '../../src/topics/useExploreResults';
import {
  cleanQuery,
  MAX_QUERY_LENGTH,
  useCreateTopic,
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

/** The most catalog rows the list shows; every matching open topic shows besides them. */
export const EXPLORE_MAX_ROWS = 20;

/**
 * The rows as the list shows them: the open topics, then the catalog rows cut to
 * `EXPLORE_MAX_ROWS` in their order, built ones first. A catalog row whose topic is open in the
 * list is left out: the open topic's row stands for it.
 */
function shown(rows: ExploreRow[]): ExploreRow[] {
  const open = rows.filter((row) => row.source === 'topic');
  const listed = new Set(open.map((row) => row.builtSlug));
  const catalog = rows
    .filter((row) => row.source === 'catalog' && !listed.has(row.builtSlug))
    .slice(0, EXPLORE_MAX_ROWS);
  const built = catalog.filter((row) => row.builtSlug !== null);
  const unbuilt = catalog.filter((row) => row.builtSlug === null);
  return [...open, ...built, ...unbuilt];
}

type ResultRowProps = { row: ExploreRow; onBuild: (row: ExploreRow) => void };

/** One result: its label, its group chip (a catalog row's), and Open or Build. */
function ResultRow({ row, onBuild }: ResultRowProps) {
  const slug = row.builtSlug;
  const action = slug === null ? copy.explore.build : copy.explore.open;
  // An open topic carries no group of its own (useExploreResults): it shows no chip.
  const group = row.source === 'topic' ? null : copy.explore.group[row.group];
  return (
    <Pressable
      testID="explore-row"
      accessibilityRole="button"
      accessibilityLabel={copy.explore.row(row.label, action, group)}
      onPress={() => {
        if (slug === null) onBuild(row);
        else openTopic(slug);
      }}
      style={styles.row}
    >
      <Text style={styles.label}>{row.label}</Text>
      {group === null ? null : <Text style={styles.chip}>{group}</Text>}
      <Text style={slug === null ? styles.chip : styles.open}>{action}</Text>
    </Pressable>
  );
}

type ResultsProps = {
  results: ReturnType<typeof useExploreResults>;
  /** The text as it would be sent. */
  text: string;
  creating: boolean;
  onBuild: (row: ExploreRow) => void;
  onCreate: () => void;
};

/**
 * The search's state under the field: the idle line, the rows, or with no rows a busy line, a
 * failure line, or (once the server found nothing) Create with the text.
 */
function Results({ results, text, creating, onBuild, onCreate }: ResultsProps) {
  if (results.status === 'idle') return <Text style={styles.line}>{copy.explore.idle}</Text>;
  const rows = shown(results.rows);
  if (rows.length > 0) {
    return (
      <View>
        {rows.map((row) => (
          <ResultRow key={row.key} row={row} onBuild={onBuild} />
        ))}
      </View>
    );
  }
  if (results.status === 'loading') return <LoadingState label={copy.explore.searching} />;
  if (results.status === 'error')
    return <Text style={styles.line}>{copy.explore.searchFailed}</Text>;
  return (
    <View style={styles.block}>
      <Text style={styles.line}>{copy.explore.noMatch}</Text>
      <Text style={styles.line}>{copy.explore.notInCatalog}</Text>
      <PrimaryButton
        label={creating ? copy.explore.creating : copy.explore.createText(text)}
        onPress={onCreate}
        disabled={creating}
      />
    </View>
  );
}

/**
 * The Explore tab (README.md:161-164; Explore plan E2, E3): the search field over one list from
 * `useExploreResults`. An open topic, or a catalog row whose topic is built, shows Open and opens
 * the topic's page; another catalog row shows Build and is requested with its key (`POST
 * /topics`). Only when the server found nothing does Create offer the text itself. A request
 * whose topic exists (a 200 with no job) opens its page; a new one shows its building card,
 * polled until its job is done, when the card opens the topic. A refused request shows one fixed
 * line ("Not available yet", the pending limit, or a failure). Before anything is typed, the
 * learner's topics show over the idle line; they are read again when the tab regains focus and
 * on pull to refresh.
 */
export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const results = useExploreResults(query);
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
        {results.status === 'idle' ? <Enrolled enrollments={enrollments} /> : null}
        <Results
          results={results}
          text={cleanQuery(query)}
          creating={request.status === 'loading'}
          onBuild={(row) => void onCreate(row.label, row.key)}
          onCreate={() => void onCreate(query)}
        />
      </ScrollView>
    </TabScreen>
  );
}

/** A row's group chip and its action: caption text in a hairline ink box. */
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  label: { ...type.button, color: colors.ink, flex: 1 },
  chip: CHIP,
  open: { ...CHIP, backgroundColor: colors.lime },
});
