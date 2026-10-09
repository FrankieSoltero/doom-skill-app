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
 * A code root's level 2 is one topic per project (M11 plan Task 21, decision M21): its variants
 * sit under one `Level 2` label, one chip each, named by the project's title with its state's line
 * under it. A variant not built yet (`pending`) is **choosable** (`Choose`) once the root's
 * enrollment is `completed`, else **locked**; a press chooses it (`useChoose`): its answer's line
 * (or that another project was chosen) shows under the row, and the row reads the topic and the
 * enrollments again. Any other variant takes the kinds above. A family without variants is drawn
 * as before.
 *
 * The learner's enrollments come from `GET /me/enrollments`, read again each time the row is drawn.
 * While they load, or when they cannot be read, they count as none: a level above the root is then
 * locked unless it is the one on screen.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { copy } from '../copy';
import { switchTo, useActiveTopic } from '../feed/useActiveTopic';
import type { ChoiceOutcome } from '../data/levels';
import { border, colors, space, type } from '../theme';
import { ENROLLMENTS_KEY, useChoose } from './useChoose';

type LevelSummary = components['schemas']['LevelSummary'];
type EnrollmentStatus = components['schemas']['EnrollmentStatus'];

/** A chip's state (see the module comment). */
type ChipKind =
  'current' | 'continue' | 'open' | 'locked' | 'building' | 'waiting' | 'failed' | 'choosable';

/** Minimum touch target, from the plan's accessibility rule. */
const MIN_TOUCH = 44;

/** A dimmed chip, as a disabled button is (OutlineButton's 0.45). */
const DIMMED = 0.45;

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

/**
 * Whether the learner completed the level below `level` (the root counts as entered always): any
 * of its members, as the server's L20 rule accepts any completed project of that level.
 */
function belowCompleted(level: LevelSummary, ctx: Context): boolean {
  if (level.level === 1) return true;
  return ctx.levels.some(
    (m) => m.level === level.level - 1 && ctx.enrolled.get(m.slug) === 'completed',
  );
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

/**
 * The project of `level`, or `null` for a level that is not a project. The topic detail is read as
 * the API sends it, unparsed: a reply from a server before M11 has no `project` at all.
 */
function projectOf(level: LevelSummary): LevelSummary['project'] {
  return level.project ?? null;
}

/** A project's chip: `choosable` or `locked` while it is not built (`pending`), else as a level. */
function variantKind(level: LevelSummary, ctx: Context): ChipKind {
  if (level.slug !== ctx.current && level.status === 'pending') {
    return belowCompleted(level, ctx) ? 'choosable' : 'locked';
  }
  return chipKind(level, ctx);
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
    case 'locked':
      return copy.levels.locked;
    case 'choosable':
      return copy.levels.pick;
    default:
      return copy.levels.badge(n);
  }
}

/** The line a choice's answer shows under the row: `building`, `waiting` or `failed`, else none. */
function answerLine(answer: ChoiceOutcome, n: number): string | null {
  const { next } = answer;
  return next === 'building' || next === 'waiting' || next === 'failed' ? chipText(next, n) : null;
}

/** What the chip of `level` says: its text and, under it, a hint, which its name also holds. */
function chipWords(level: LevelSummary, kind: ChipKind): { text: string; hint: string | null } {
  const line = chipText(kind, level.level);
  const project = projectOf(level);
  if (project === null) {
    return { text: kind === 'locked' ? copy.levels.badge(level.level) : line, hint: null };
  }
  const named = kind === 'current' || kind === 'open';
  return { text: project.title, hint: named ? null : line };
}

/** What a press does, or `null` for a chip that cannot be pressed; `choose` chooses a project. */
function chipAction(
  kind: ChipKind,
  slug: string,
  choose: (slug: string) => void,
): (() => void) | null {
  if (kind === 'choosable') {
    return () => {
      choose(slug);
    };
  }
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

type ChipProps = {
  level: LevelSummary;
  kind: ChipKind;
  /** Chooses the project `slug` (a `choosable` chip). */
  choose: (slug: string) => void;
  /** Greys a `choosable` chip while a choice is in flight. */
  busy: boolean;
};

/** One level's chip. */
function Chip({ level, kind, choose, busy }: ChipProps) {
  const { text, hint: shown } = chipWords(level, kind);
  const action = busy && kind === 'choosable' ? null : chipAction(kind, level.slug, choose);
  const locked = kind === 'locked';
  const hint = locked ? copy.levels.locked : shown;
  const label = hint === null ? text : `${text}, ${hint}`;
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
      {hint === null ? null : <Text style={styles.hint}>{hint}</Text>}
    </Pressable>
  );
}

/** A level of the row: one topic, or a level's projects under its label. */
type Entry = { n: number; members: LevelSummary[]; projects: boolean };

/** The row's entries in the family's order, a level's projects grouped where the first one is. */
function entriesOf(levels: readonly LevelSummary[]): Entry[] {
  const entries: Entry[] = [];
  for (const level of levels) {
    const group = entries.find((e) => e.projects && e.n === level.level);
    const project = projectOf(level) !== null;
    if (project && group !== undefined) group.members.push(level);
    else entries.push({ n: level.level, members: [level], projects: project });
  }
  return entries;
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
  const { choose, pending, error } = useChoose();
  const [said, setSaid] = useState<string | null>(null);
  const pick = (slug: string, n: number) => {
    setSaid(null);
    // A failed choice is the hook's `error`, drawn under the row.
    choose(slug).then(
      (answer) => {
        setSaid(answerLine(answer, n));
      },
      () => undefined,
    );
  };
  const chip = (level: LevelSummary) => (
    <Chip
      key={level.slug}
      level={level}
      kind={projectOf(level) === null ? chipKind(level, ctx) : variantKind(level, ctx)}
      choose={(slug) => {
        pick(slug, level.level);
      }}
      busy={pending}
    />
  );
  const line = error === null ? said : failureLine(error);
  return (
    <View testID="levels-row" style={styles.row}>
      {entriesOf(levels).map((entry) =>
        entry.projects ? (
          <View key={`level-${String(entry.n)}`} style={styles.group}>
            <Text style={styles.label}>{copy.levels.badge(entry.n)}</Text>
            <View style={styles.row}>{entry.members.map(chip)}</View>
          </View>
        ) : (
          entry.members.map(chip)
        ),
      )}
      {line === null ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.said}>
          {line}
        </Text>
      )}
    </View>
  );
}

/** The line under the row for a failed choice. */
function failureLine(error: 'chosenOther' | 'failed'): string {
  return error === 'chosenOther' ? copy.levels.chosenOther : copy.topic.enrollFailed;
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
  group: { flexBasis: '100%', gap: space[1] },
  label: { ...type.small, color: colors.ink },
  said: { ...type.small, flexBasis: '100%', color: colors.ink },
});
