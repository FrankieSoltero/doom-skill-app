import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/errors';
import { LoadingState } from '../../src/components/LoadingState';
import { PendingTopic } from '../../src/components/PendingTopic';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { SearchField } from '../../src/components/SearchField';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { BranchesSheet } from '../../src/topics/BranchesSheet';
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

/** The building card of a requested topic: it opens the topic once its job is done. */
function PendingCard({ pending, onReady }: { pending: Pending; onReady: () => void }) {
  return (
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
        onReady={onReady}
      />
    </Pressable>
  );
}

/** A refused request's one fixed line, announced when it appears. */
function FailureLine({ line }: { line: string }) {
  return (
    <View accessibilityLiveRegion="polite">
      <Text style={styles.line}>{line}</Text>
    </View>
  );
}

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

/** The size and stroke of a row's chevron, as the search field's icon. */
const CHEVRON_SIZE = 18;
const CHEVRON_STROKE = 1.5;

type ResultRowProps = {
  row: ExploreRow;
  /** The row's own action: open it if built, else build it. */
  onAct: (row: ExploreRow) => void;
  /** Given, a row with branches shows their count and a chevron, and its tap calls this. */
  onBranches?: (row: ExploreRow) => void;
};

/**
 * One result: its label, its group chip (a catalog row's), and Open or Build; or, for a row with
 * branches in the list (`onBranches`), their count and a chevron, its tap opening them.
 */
function ResultRow({ row, onAct, onBranches }: ResultRowProps) {
  const slug = row.builtSlug;
  const branching = onBranches !== undefined && row.branches > 0;
  const action = slug === null ? copy.explore.build : copy.explore.open;
  const count = copy.explore.branches(row.branches);
  // An open topic carries no group of its own (useExploreResults): it shows no chip.
  const group = row.source === 'topic' ? null : copy.explore.group[row.group];
  return (
    <Pressable
      testID="explore-row"
      accessibilityRole="button"
      accessibilityLabel={copy.explore.row(row.label, branching ? count : action, group)}
      onPress={() => {
        if (branching) onBranches(row);
        else onAct(row);
      }}
      style={styles.row}
    >
      <Text style={styles.label}>{row.label}</Text>
      {group === null ? null : <Text style={styles.chip}>{group}</Text>}
      {branching ? (
        <>
          <Text style={styles.count}>{count}</Text>
          <ChevronRight
            testID="explore-row-chevron"
            size={CHEVRON_SIZE}
            strokeWidth={CHEVRON_STROKE}
            color={colors.ink}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </>
      ) : (
        <Text style={slug === null ? styles.chip : styles.open}>{action}</Text>
      )}
    </Pressable>
  );
}

type ResultsProps = {
  results: ReturnType<typeof useExploreResults>;
  /** The text as it would be sent. */
  text: string;
  creating: boolean;
  onAct: (row: ExploreRow) => void;
  onBranches: (row: ExploreRow) => void;
  onCreate: () => void;
};

/**
 * The search's state under the field: the idle line, the rows, or with no rows a busy line, a
 * failure line, or (once the server found nothing) Create with the text.
 */
function Results({ results, text, creating, onAct, onBranches, onCreate }: ResultsProps) {
  if (results.status === 'idle') return <Text style={styles.line}>{copy.explore.idle}</Text>;
  const rows = shown(results.rows);
  if (rows.length > 0) {
    return (
      <View>
        {rows.map((row) => (
          <ResultRow key={row.key} row={row} onAct={onAct} onBranches={onBranches} />
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
 * line ("Not available yet", the pending limit, or a failure). A catalog row with branches shows
 * their count and opens them in a sheet (src/topics/BranchesSheet.tsx), whose Learn all and
 * branches each do that row's own action, closing the sheet. Before anything is typed, the
 * learner's topics show over the idle line; they are read again when the tab regains focus and
 * on pull to refresh.
 */
export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [openBranches, setOpenBranches] = useState<ExploreRow | null>(null);
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

  /** A row's own action: open its topic if built, else request it with its catalog key. */
  const act = (row: ExploreRow) => {
    if (row.builtSlug === null) void onCreate(row.label, row.key);
    else openTopic(row.builtSlug);
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
          <PendingCard
            pending={pending}
            onReady={() => {
              setPending({ ...pending, ready: true });
            }}
          />
        )}
        {failure === null ? null : <FailureLine line={failure} />}
        {results.status === 'idle' ? <Enrolled enrollments={enrollments} /> : null}
        <Results
          results={results}
          text={cleanQuery(query)}
          creating={request.status === 'loading'}
          onAct={act}
          onBranches={setOpenBranches}
          onCreate={() => void onCreate(query)}
        />
      </ScrollView>
      {openBranches === null ? null : (
        <BranchesSheet
          subject={openBranches}
          Row={ResultRow}
          onPick={(row) => {
            setOpenBranches(null);
            act(row);
          }}
          onClose={() => {
            setOpenBranches(null);
          }}
        />
      )}
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
  count: { ...type.caption, color: colors.neutral[700] },
});
