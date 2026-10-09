import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import type { ChoiceOutcome } from '../data/levels';
import { switchTo } from '../feed/useActiveTopic';
import type { LevelOutcome } from '../feed/useCheckpointResult';
import { border, fonts, space, type } from '../theme';
import { useChoose } from '../topics/useChoose';

/** The heading's lines: "Level 3 complete · +300 points" is 30 characters, about 165 points. */
const COMPLETED_LINES = 1;
/** The line about the next level's lines: the longest, `building`, is 51 characters. */
const NEXT_LINES = 2;
/** Space between the heading and the line under it. */
const GAP = space[1];
/** The line over the projects (`choose`, or the failed choice's line): one line. */
const PROMPT_LINES = 1;
/**
 * A project's row (M11 plan decision M21): its title and style, then its brief, one small line
 * each; above the 44-point minimum touch target.
 */
export const CHOICE_ROW_HEIGHT = 52;
/**
 * How long the unlock waits to be announced: the server's verdict (`CheckpointFeedback`) is
 * announced as the same grade arrives, and an iOS announcement cuts off the one before it.
 */
export const UNLOCK_ANNOUNCE_DELAY_MS = 2500;

/**
 * The tallest the unlock is drawn: the heading's line, the gap, and the line about the next level
 * at its most. The checkpoint card's height budget adds it (CheckpointCard.height.test.ts).
 */
export const LEVEL_UNLOCK_HEIGHT =
  COMPLETED_LINES * type.small.lineHeight + GAP + NEXT_LINES * type.small.lineHeight;

type LevelNext = LevelOutcome['next'];

/**
 * The line about level `n` for `next`; `null` for `enrolled` (a button), `choose` (the projects)
 * and none.
 */
function nextLine(next: LevelNext, n: number): string | null {
  switch (next) {
    case 'building':
      return copy.levels.building(n);
    case 'waiting':
      return copy.levels.waiting(n);
    case 'deepest':
      return copy.levels.deepest;
    case 'failed':
      return copy.levels.failed(n);
    default:
      return null;
  }
}

/** The way into the next level: its button's label and its slug. */
export type ContinueTarget = { label: string; slug: string };

/**
 * The next level to continue to when the learner is enrolled in it (`next` = `enrolled`, with its
 * slug); else `null`. The checkpoint card's one button then reads "Continue to Level n" (L21).
 */
export function continueTarget(outcome: LevelOutcome): ContinueTarget | null {
  if (outcome.next !== 'enrolled' || outcome.next_slug === null) return null;
  return { label: copy.levels.continueTo(outcome.level + 1), slug: outcome.next_slug };
}

/** Opens `slug` in the Today feed: it becomes the active topic, and this screen closes to it. */
export function continueTo(slug: string): void {
  void switchTo(slug);
  router.dismissTo('/');
}

/** The line the unlock says first of a choice of projects, before one is pressed. */
function choiceLine(outcome: LevelOutcome, later: boolean): string {
  const n = outcome.level + 1;
  if (outcome.choices.length > 0) return copy.levels.choose(n);
  return later ? copy.levels.choicesLater(n) : copy.levels.drafting(n);
}

/** One line of the unlock, at most `lines` long. */
function Line({ text, lines = NEXT_LINES }: { text: string; lines?: number }) {
  const color = useCardTextColor();
  return (
    <Text numberOfLines={lines} style={[styles.text, { color }]}>
      {text}
    </Text>
  );
}

type Choice = LevelOutcome['choices'][number];

/** A project's row: a button named by its title and style, its brief under them. */
function ChoiceRow({
  choice,
  disabled,
  onPress,
}: {
  choice: Choice;
  disabled: boolean;
  onPress: () => void;
}) {
  const color = useCardTextColor();
  const label = copy.levels.choiceLine(choice.title, choice.style);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={choice.brief}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, { borderColor: color }]}
    >
      <Text numberOfLines={1} style={[styles.text, styles.heading, { color }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[styles.text, { color }]}>
        {choice.brief}
      </Text>
    </Pressable>
  );
}

/** What a choice did: the way into the chosen level (`enrolled`), else its line. */
function ChoiceAnswer({ answer, n }: { answer: ChoiceOutcome; n: number }) {
  if (answer.next === 'enrolled') {
    return (
      <PrimaryButton
        label={copy.levels.continueTo(n)}
        onPress={() => {
          continueTo(answer.slug);
        }}
      />
    );
  }
  const line = nextLine(answer.next, n);
  return line === null ? null : <Line text={line} />;
}

/**
 * The level-2 projects to choose from (`next` = `choose`, M11 plan decision M21): `choose(n)` and
 * one row each; a press chooses it (`useChoose`) and its answer takes the rows' place. With no
 * projects yet, `drafting(n)`, or `choicesLater(n)` once the grade was asked for them in vain
 * (`later`). A 409 says another project was chosen; another failure says so in the heading's
 * place and keeps the rows to press again.
 */
function ProjectChoice({ outcome, later }: { outcome: LevelOutcome; later: boolean }) {
  const n = outcome.level + 1;
  const { choose, pending, error } = useChoose();
  const [answer, setAnswer] = useState<ChoiceOutcome | null>(null);
  if (answer !== null) return <ChoiceAnswer answer={answer} n={n} />;
  if (error === 'chosenOther') return <Line text={copy.levels.chosenOther} />;
  if (outcome.choices.length === 0) return <Line text={choiceLine(outcome, later)} />;
  const pick = (slug: string) => {
    // A failed choice is the hook's `error`, drawn above.
    choose(slug).then(setAnswer, () => undefined);
  };
  const prompt = error === 'failed' ? copy.topic.enrollFailed : copy.levels.choose(n);
  return (
    <>
      <Line text={prompt} lines={PROMPT_LINES} />
      <View testID="choice-rows">
        {outcome.choices.map((choice) => (
          <ChoiceRow
            key={choice.slug}
            choice={choice}
            disabled={pending}
            onPress={() => {
              pick(choice.slug);
            }}
          />
        ))}
      </View>
    </>
  );
}

type LevelUnlockProps = {
  outcome: LevelOutcome;
  /** The grade was asked for the projects `CHOICE_POLLS` times without them (useCheckpointResult). */
  choicesLater?: boolean;
};

/**
 * The unlock moment under a passed checkpoint (M10 plan L, L17, L21): the level finished and the
 * points it paid, then by `next` one line: being built, nearly ready, the deepest for now, or
 * couldn't be built. For `enrolled` the way on is the card's own button (`continueTarget`). For
 * `choose` it lists the level-2 projects to pick from (`ProjectChoice`, M11 plan decision M21). It
 * sits in a polite live region and is announced once, `UNLOCK_ANNOUNCE_DELAY_MS` after it
 * appears, so the server's verdict is heard first; a choice's first line is announced with it.
 */
export function LevelUnlock({ outcome, choicesLater = false }: LevelUnlockProps) {
  const color = useCardTextColor();
  const heading = copy.levels.completed(outcome.level, outcome.points);
  const choosing = outcome.next === 'choose';
  const line = choosing
    ? choiceLine(outcome, choicesLater)
    : nextLine(outcome.next, outcome.level + 1);
  const spoken = line === null ? heading : `${heading}. ${line}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      announce(spoken);
    }, UNLOCK_ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [spoken]);

  return (
    <View testID="level-unlock" accessibilityLiveRegion="polite" style={styles.unlock}>
      <Text numberOfLines={COMPLETED_LINES} style={[styles.text, styles.heading, { color }]}>
        {heading}
      </Text>
      {choosing ? <ProjectChoice outcome={outcome} later={choicesLater} /> : null}
      {!choosing && line !== null ? <Line text={line} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  unlock: { gap: GAP },
  text: type.small,
  heading: { fontFamily: fonts.bodyBold },
  row: {
    height: CHOICE_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderWidth: border.strong,
  },
});
