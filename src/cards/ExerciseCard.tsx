import { useMemo, type ReactNode } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { announce } from '../components/announce';
import { BeatGrid } from '../components/BeatGrid';
import { CardFrame } from '../components/CardFrame';
import { CodeEditor } from '../components/CodeEditor';
import { FadedBorder } from '../components/FadedBorder';
import { PrimaryButton } from '../components/PrimaryButton';
import { ResultBadge } from '../components/ResultBadge';
import { spokenText } from '../components/spokenText';
import { copy } from '../copy';
import type { ExerciseCard as ExerciseCardData } from '../data';
import type { CardAnswer } from '../feed/answers';
import { checkExercise, parseGrid } from '../feed/exercise';
import { useFeedStore } from '../feed/store';
import { useStrudel, type PlayerOwner } from '../strudel/useStrudel';
import { border, colors } from '../theme';
import { AudioNotice } from './AudioNotice';
import { cardKickerText, cardMetaText } from './cardLabels';
import { CardTitle } from './CardText';
import { DismissKeyboardArea } from './DismissKeyboardArea';
import { ExerciseControls } from './ExerciseControls';
import { useDismissKeyboardWhenLeft } from './useDismissKeyboardWhenLeft';
import { isClearableError, useMessageSlot } from './useMessageSlot';
import { useStopWhenAway } from './useStopWhenAway';

// Exercise card values from docs/design/card-feed/README.md:86-112 that the theme does not hold.
/** The editor's height, README.md:90 ("100px tall"). */
const EDITOR_HEIGHT = 100;
/** Opacity of the frame's border and divider, README.md:89 ("paper at 25% opacity"). */
const FRAME_LINE_OPACITY = 0.25;

type ExerciseAnswer = Extract<CardAnswer, { kind: 'exercise' }>;
type CheckResult = NonNullable<ExerciseAnswer['result']>;

/** The exercise answer in `answer`; null for no answer or an answer of another kind. */
function exerciseOf(answer: CardAnswer | undefined): ExerciseAnswer | null {
  return answer?.kind === 'exercise' ? answer : null;
}

/** The badge for a check result, README.md:107-108: lime `Spec met` or yellow `Not yet`. */
function resultBadge(result: CheckResult, card: ExerciseCardData) {
  return result === 'pass'
    ? { tone: 'pass' as const, label: copy.specMet, message: card.passMsg }
    : { tone: 'warn' as const, label: copy.notYet, message: card.failMsg };
}

type EditorFrameProps = {
  code: string;
  onChange: (code: string) => void;
  /** The playhead to show: the step being heard, or null when not playing. */
  step: number | null;
  /** Whether to draw the beat grid: only for code the app can play. */
  grid: boolean;
};

/**
 * The editor and its beat grid under a divider, inside a 1pt paper border at 25%, README.md:89-101.
 * The border is a view that holds nothing (see `FadedBorder`), and the content sits inside it.
 * Code with no pattern has no grid, and then no divider; nor has an exercise without `grid`.
 */
function EditorFrame({ code, onChange, step, grid }: EditorFrameProps) {
  const rows = useMemo(() => (grid ? parseGrid(code) : []), [code, grid]);
  return (
    <View testID="exercise-editor-frame" style={styles.frame}>
      <FadedBorder opacity={FRAME_LINE_OPACITY} />
      <CodeEditor value={code} onChange={onChange} caret={colors.lime} height={EDITOR_HEIGHT} />
      {rows.length === 0 ? null : <View testID="exercise-divider" style={styles.divider} />}
      {grid ? <BeatGrid rows={rows} step={step} /> : null}
    </View>
  );
}

/** The card as its player names it in the log: its page, and its id when the API served it. */
function playerOwner(card: ExerciseCardData, index: number): PlayerOwner {
  return card.id === undefined ? { cardIndex: index } : { cardIndex: index, cardId: card.id };
}

type ExerciseCardProps = {
  card: ExerciseCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** True while the card's page is the current one. Leaving it stops the audio. */
  active: boolean;
  /** Called when the learner presses Next card, which is enabled once the code passes. */
  onNext: () => void;
};

/**
 * The learner's answer at `index`: the code (the starter code before the first edit) and the
 * result of its last check. `edit` stores new code with no result; `check` runs the card's checks
 * on the code in the store (not this render: an edit may land just before a press), stores the
 * result and announces its badge.
 */
function useExerciseAnswer(card: ExerciseCardData, index: number) {
  const code = useFeedStore((state) => exerciseOf(state.answers[index])?.code ?? card.starterCode);
  const result = useFeedStore((state) => exerciseOf(state.answers[index])?.result ?? null);
  const setAnswer = useFeedStore((state) => state.setAnswer);
  const codeNow = () =>
    exerciseOf(useFeedStore.getState().answers[index])?.code ?? card.starterCode;
  const edit = (next: string) => {
    setAnswer(index, { kind: 'exercise', code: next, result: null });
  };
  const check = () => {
    const checked = codeNow();
    const passed = checkExercise(checked, card.checks, card.lang);
    setAnswer(index, { kind: 'exercise', code: checked, result: passed ? 'pass' : 'fail' });
    const badge = resultBadge(passed ? 'pass' : 'fail', card);
    announce(copy.badgeSpoken(badge.label, spokenText(badge.message)));
  };
  return { code, result, codeNow, edit, check };
}

type ExerciseLayoutProps = {
  card: ExerciseCardData;
  result: CheckResult | null;
  onNext: () => void;
  /** The editor frame, the buttons and the message, in that order. */
  children: ReactNode;
};

/** The card around its editor (README.md:86-112): kicker row, title, a flex spacer, Next card. */
function ExerciseLayout({ card, result, onNext, children }: ExerciseLayoutProps) {
  return (
    <DismissKeyboardArea>
      <CardFrame type="exercise" kicker={cardKickerText(card)} meta={cardMetaText(card.estSeconds)}>
        <CardTitle size="s">{card.title}</CardTitle>
        {children}
        <View testID="exercise-spacer" style={styles.spacer} />
        <PrimaryButton
          label={copy.nextCard}
          onPress={onNext}
          disabled={result !== 'pass'}
          variant="paper"
        />
      </CardFrame>
    </DismissKeyboardArea>
  );
}

/**
 * The Strudel exercise: the editor over its beat grid, Play or Stop and Check, and one message (the
 * check result or the audio notice, whichever happened last; see useMessageSlot).
 *
 * The audio comes from `useStrudel`, named after this card (its page, and its id when the API
 * served it), whose player is rendered once, last, in every state, so it is never remounted. Play
 * needs a ready player, no audio error and some code; editing clears an audio error, and playing
 * goes on until the learner presses Play again or Stop. The audio stops when the card is left, its
 * screen loses focus or the app leaves the foreground.
 */
function StrudelExerciseCard({ card, index, active, onNext }: ExerciseCardProps) {
  const strudel = useStrudel(playerOwner(card, index));
  const answer = useExerciseAnswer(card, index);
  const slot = useMessageSlot(strudel, answer.result !== null);
  useStopWhenAway({ active, stop: strudel.stop });
  useDismissKeyboardWhenLeft(active);

  const onChange = (next: string) => {
    answer.edit(next);
    if (isClearableError(strudel.error)) strudel.clearError();
  };
  // Each button dismisses the keyboard first: it would cover the result and the notices.
  const onCheck = () => {
    Keyboard.dismiss();
    // The result takes the message slot from any audio notice; an ordinary error is cleared.
    if (isClearableError(strudel.error)) strudel.clearError();
    slot.checked();
    answer.check();
  };
  const onPlay = () => {
    Keyboard.dismiss();
    strudel.clearError();
    strudel.play(answer.codeNow());
  };
  const onStop = () => {
    Keyboard.dismiss();
    strudel.stop();
  };
  const onReset = () => {
    Keyboard.dismiss();
    strudel.reset();
    strudel.clearError();
  };
  const canPlay = strudel.status === 'ready' && strudel.error === null && answer.code.trim() !== '';
  // One message at a time, whichever happened last (see useMessageSlot). The stored result, and
  // so Next card, do not change when a notice covers the badge.
  const { result } = answer;
  const badge = result !== null && slot.badgeShown ? resultBadge(result, card) : null;

  return (
    <>
      <ExerciseLayout card={card} result={result} onNext={onNext}>
        <EditorFrame
          code={answer.code}
          onChange={onChange}
          step={strudel.playing ? strudel.step : null}
          grid
        />
        <ExerciseControls
          playing={strudel.playing}
          canPlay={canPlay}
          onPlay={onPlay}
          onStop={onStop}
          onCheck={onCheck}
        />
        {badge === null ? (
          <AudioNotice audio={strudel} onReset={onReset} />
        ) : (
          <ResultBadge {...badge} />
        )}
      </ExerciseLayout>
      {strudel.player}
    </>
  );
}

/**
 * An exercise the app checks but cannot play (`sql`; M6 hardening Task 8): the editor with no
 * grid, Check alone, and the check result. It never starts the Strudel player.
 */
function CheckOnlyExerciseCard({ card, index, active, onNext }: ExerciseCardProps) {
  const answer = useExerciseAnswer(card, index);
  useDismissKeyboardWhenLeft(active);
  const onCheck = () => {
    Keyboard.dismiss();
    answer.check();
  };
  const badge = answer.result === null ? null : resultBadge(answer.result, card);

  return (
    <ExerciseLayout card={card} result={answer.result} onNext={onNext}>
      <EditorFrame code={answer.code} onChange={answer.edit} step={null} grid={false} />
      <ExerciseControls onCheck={onCheck} />
      {badge === null ? null : <ResultBadge {...badge} />}
    </ExerciseLayout>
  );
}

/**
 * The exercise card (README.md:86-112): kicker row, title, the code editor, the buttons, one
 * message, a flex spacer, then Next card (paper), enabled after a pass. A Strudel exercise can be
 * played as well as checked (`StrudelExerciseCard`); any other language is only checked
 * (`CheckOnlyExerciseCard`).
 *
 * A tap on the card outside the editor and the buttons, and every button, dismisses the keyboard.
 * The answer lives in the feed store at `index`: before the first edit there is none and the editor
 * shows the starter code; an edit stores the code with no result; Check stores the result for the
 * code.
 */
export function ExerciseCard(props: ExerciseCardProps) {
  return props.card.lang === 'strudel' ? (
    <StrudelExerciseCard {...props} />
  ) : (
    <CheckOnlyExerciseCard {...props} />
  );
}

const styles = StyleSheet.create({
  // Inset by the border's width, so the content sits inside the border as in the prototype.
  frame: { padding: border.hairline },
  divider: { height: border.hairline, backgroundColor: colors.paper, opacity: FRAME_LINE_OPACITY },
  spacer: { flex: 1 },
});
