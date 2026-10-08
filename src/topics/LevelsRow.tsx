/**
 * A topic's levels on its screen (M10 plan L Task 15; decisions L16, L20): one chip per topic of
 * its family (`levels`, the root first), each a button named after the level and its state.
 *
 * - **current**: the topic on screen, highlighted and announced as selected; a press does nothing.
 * - **continue**: a published level the learner is enrolled in, above their active topic's level —
 *   "Continue to Level n" makes it the active topic and closes to the Today tab. This is how a
 *   learner who waited for a level finds it once it is published.
 * - **open**: a published level the learner may enter — enrolled in and active, enrolled in and
 *   below the active level, the root, or the level above one whose enrollment is `completed` —
 *   opens that level's topic screen.
 * - **locked**: any other published level, greyed with the locked hint (L20: a level is entered
 *   only after the level below; the server's enroll applies the same rule).
 * - **building** / **waiting** / **failed**: a level not ready (`failed`, else still being built),
 *   or ready and not published yet. Not pressable.
 *
 * The learner's enrollments come from `GET /me/enrollments`, read again each time the row is drawn.
 * While they load, or when they cannot be read, they count as none: a level above the root is then
 * locked unless it is the one on screen.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { copy } from '../copy';
import { switchTo, useActiveTopic } from '../feed/useActiveTopic';
import { border, colors, space, type } from '../theme';

type LevelSummary = components['schemas']['LevelSummary'];
type EnrollmentStatus = components['schemas']['EnrollmentStatus'];

/** A chip's state (see the module comment). */
type ChipKind = 'current' | 'continue' | 'open' | 'locked' | 'building' | 'waiting' | 'failed';

/** Minimum touch target, from the plan's accessibility rule. */
const MIN_TOUCH = 44;

/** A dimmed chip, as a disabled button is (OutlineButton's 0.45). */
const DIMMED = 0.45;

/** The enrollments' key in the server-state cache. */
const ENROLLMENTS_KEY = ['enrollments'] as const;

/** The learner's enrollments, by topic slug. */
async function fetchEnrollments(signal: AbortSignal): Promise<Map<string, EnrollmentStatus>> {
  const { data } = await requireApi().GET('/me/enrollments', { signal });
  if (data === undefined) throw new Error('The enrollments request gave no body');
  return new Map(data.enrollments.map((e) => [e.topic_slug, e.status]));
}

type Context = {
  current: string;
  active: string | null;
  enrolled: ReadonlyMap<string, EnrollmentStatus>;
  levels: readonly LevelSummary[];
};

/** Whether the learner completed the level below `level` (the root counts as entered always). */
function belowCompleted(level: LevelSummary, ctx: Context): boolean {
  if (level.level === 1) return true;
  const below = ctx.levels.find((m) => m.level === level.level - 1);
  return below !== undefined && ctx.enrolled.get(below.slug) === 'completed';
}

/** An enrolled level's chip: open when it is the active topic or below its level, else continue. */
function enrolledKind(level: LevelSummary, ctx: Context): ChipKind {
  const activeLevel = ctx.levels.find((m) => m.slug === ctx.active)?.level;
  const below = activeLevel !== undefined && level.level < activeLevel;
  return level.slug === ctx.active || below ? 'open' : 'continue';
}

/** The chip's state for `level` (see the module comment). */
function chipKind(level: LevelSummary, ctx: Context): ChipKind {
  if (level.slug === ctx.current) return 'current';
  if (level.status === 'failed') return 'failed';
  if (level.status !== 'ready') return 'building';
  if (!level.published) return 'waiting';
  if (ctx.enrolled.has(level.slug)) return enrolledKind(level, ctx);
  return belowCompleted(level, ctx) ? 'open' : 'locked';
}

/** The chip's text: the level's badge, or the line its state shows. */
function chipText(kind: ChipKind, n: number): string {
  switch (kind) {
    case 'continue':
      return copy.levels.continueTo(n);
    case 'building':
      return copy.levels.building(n);
    case 'waiting':
      return copy.levels.waiting(n);
    case 'failed':
      return copy.levels.failed(n);
    default:
      return copy.levels.badge(n);
  }
}

/** What a press does, or `null` for a chip that cannot be pressed. */
function chipAction(kind: ChipKind, slug: string): (() => void) | null {
  if (kind === 'open') {
    return () => {
      router.push({ pathname: '/topic/[slug]', params: { slug } });
    };
  }
  if (kind === 'continue') {
    return () => {
      void switchTo(slug);
      router.dismissTo('/');
    };
  }
  return null;
}

/** One level's chip. */
function Chip({ level, kind }: { level: LevelSummary; kind: ChipKind }) {
  const text = chipText(kind, level.level);
  const action = chipAction(kind, level.slug);
  const locked = kind === 'locked';
  const label = locked ? `${text}, ${copy.levels.locked}` : text;
  // The current chip is selected, not dimmed: it cannot be pressed, but it is not disabled.
  const disabled = action === null && kind !== 'current';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: kind === 'current' }}
      disabled={disabled}
      onPress={action}
      style={[styles.chip, kind === 'current' ? styles.current : null, locked ? styles.dim : null]}
    >
      <Text style={styles.chipText}>{text}</Text>
      {locked ? <Text style={styles.hint}>{copy.levels.locked}</Text> : null}
    </Pressable>
  );
}

type LevelsRowProps = {
  /** The topic's family by level, the root first (`TopicDetail.levels`). */
  levels: LevelSummary[];
  /** The slug of the topic on screen. */
  current: string;
};

/** The row (see the module comment). */
export function LevelsRow({ levels, current }: LevelsRowProps) {
  const { slug: active } = useActiveTopic();
  const enrollments = useQuery({
    queryKey: ENROLLMENTS_KEY,
    queryFn: ({ signal }) => fetchEnrollments(signal),
    staleTime: 0,
  });
  const ctx: Context = { current, active, enrolled: enrollments.data ?? new Map(), levels };
  return (
    <View testID="levels-row" style={styles.row}>
      {levels.map((level) => (
        <Chip key={level.slug} level={level} kind={chipKind(level, ctx)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: MIN_TOUCH,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  current: { backgroundColor: colors.yellow },
  dim: { opacity: DIMMED },
  chipText: { ...type.button, color: colors.ink },
  hint: { ...type.small, color: colors.ink },
});
