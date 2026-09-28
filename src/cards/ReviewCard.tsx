import { Eye } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { BoldText } from '../components/BoldText';
import { CardFrame } from '../components/CardFrame';
import { useCardTextColor } from '../components/cardTextColor';
import { CodeBlock } from '../components/CodeBlock';
import { spokenText } from '../components/spokenText';
import { copy } from '../copy';
import type { ReviewCard as ReviewCardData } from '../data';
import type { CardAnswer } from '../feed/answers';
import { useFeedStore } from '../feed/store';
import { border, colors, fonts, type } from '../theme';
import { cardMetaText, reviewKickerText } from './cardLabels';
import { CardTitle } from './CardText';
import { RatingRow } from './RatingRow';
import type { Rating } from './RatingRow';

// Review card values from docs/design/card-feed/README.md:114-121 and, where it gives none, the
// prototype docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html, that the theme lacks.
/**
 * How long after a rating the card moves on, README.md:121 ("auto-advances 550ms after rating").
 * `motion` in the theme holds no such timing.
 */
const ADVANCE_DELAY = 550;
/** Height of the reveal button, README.md:116 ("a 130px dashed 1.5px ink button"). */
const REVEAL_HEIGHT = 130;
/** Space between the eye icon and the reveal text, prototype line 187 ("gap:6px"). */
const REVEAL_GAP = 6;
/** The reveal text's size, prototype line 187 ("font-size:16px"), in the body font. */
const REVEAL_SIZE = 16;
/** 16px at the prototype's body line height of 1.55, rounded. */
const REVEAL_LINE_HEIGHT = 25;
/**
 * The eye icon's size. README.md:22 gives icons 16-22px; the prototype's eye is 24 (line 188),
 * so the largest size the README allows.
 */
const ICON_SIZE = 22;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** The answer's size, README.md:118 ("(17px)"). The theme's body is 15. */
const ANSWER_SIZE = 17;
/** 17px at the prototype's body line height of 1.55, rounded. */
const ANSWER_LINE_HEIGHT = 26;
/** Space between the answer and its code block, prototype line 193 ("gap:10px"). */
const ANSWER_GAP = 10;

type ReviewCardProps = {
  card: ReviewCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Moves on to the next page. The card calls it once, 550 ms after the learner rates. */
  onNext: () => void;
};

type ReviewAnswer = Extract<CardAnswer, { kind: 'review' }>;

/** The review answer in `answer`; null for no answer or an answer of another kind. */
function reviewOf(answer: CardAnswer | undefined): ReviewAnswer | null {
  return answer?.kind === 'review' ? answer : null;
}

/**
 * Returns a function that calls `onNext` once, `ADVANCE_DELAY` ms after it is called. The timer
 * is cleared if the card is removed first.
 */
function useAdvanceLater(onNext: () => void): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return () => {
    timer.current = setTimeout(onNext, ADVANCE_DELAY);
  };
}

/** The dashed button that shows the answer (README.md:116): an eye icon over the prompt to recall. */
function RevealButton({ onPress }: { onPress: () => void }) {
  const color = useCardTextColor();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.recallThenReveal}
      onPress={onPress}
      style={styles.reveal}
    >
      <Eye
        testID="reveal-icon"
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
        color={color}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.revealText, { color }]}>{copy.recallThenReveal}</Text>
    </Pressable>
  );
}

/** The revealed answer (README.md:118): the answer text with its bold marking, then its code. */
function RevealedAnswer({ answer, snippet }: { answer: string; snippet: string }) {
  const color = useCardTextColor();
  return (
    <View testID="review-answer" style={styles.answer}>
      <View testID="review-answer-text" accessibilityLiveRegion="polite">
        <BoldText text={answer} style={[styles.answerText, { color }]} />
      </View>
      <CodeBlock code={snippet} />
    </View>
  );
}

/**
 * The review card (README.md:114-121): kicker row, the prompt as the title, and a dashed reveal
 * button. Once revealed: the answer and its code, a flex spacer, then the rating row pinned at
 * the bottom. A rating is stored once; 550 ms after it the card calls `onNext`, which the screen
 * binds to this card's page and gates. The advance is a convenience, not decoration, so it runs
 * with reduce motion set. A card drawn with a rating already stored starts no timer. The
 * answer lives in the feed store at `index`, and the card selects only its own fields of it.
 */
export function ReviewCard({ card, index, onNext }: ReviewCardProps) {
  const revealed = useFeedStore((state) => reviewOf(state.answers[index])?.revealed ?? false);
  const rating = useFeedStore((state) => reviewOf(state.answers[index])?.rating ?? null);
  const setAnswer = useFeedStore((state) => state.setAnswer);
  const advanceLater = useAdvanceLater(onNext);

  const onReveal = () => {
    setAnswer(index, { kind: 'review', revealed: true, rating: null });
    announce(spokenText(card.answer));
  };

  const onRate = (position: Rating) => {
    // Read the store, not this render: a second tap may come before the card re-renders.
    const stored = reviewOf(useFeedStore.getState().answers[index])?.rating ?? null;
    if (stored !== null) return;
    setAnswer(index, { kind: 'review', revealed: true, rating: position });
    advanceLater();
  };

  return (
    <CardFrame type="review" kicker={reviewKickerText(card)} meta={cardMetaText(card.estSeconds)}>
      <CardTitle size="l">{card.prompt}</CardTitle>
      {revealed ? (
        <RevealedAnswer answer={card.answer} snippet={card.snippet} />
      ) : (
        <RevealButton onPress={onReveal} />
      )}
      <View testID="review-spacer" style={styles.spacer} />
      {revealed ? <RatingRow ratings={card.ratings} rating={rating} onRate={onRate} /> : null}
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  // React Native draws a dashed border only with one width and one color on all four sides (iOS
  // draws nothing otherwise), so these are set for all sides at once and never per side.
  reveal: {
    height: REVEAL_HEIGHT,
    borderWidth: border.strong,
    borderColor: colors.ink,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: REVEAL_GAP,
  },
  revealText: { fontFamily: fonts.body, fontSize: REVEAL_SIZE, lineHeight: REVEAL_LINE_HEIGHT },
  answer: { gap: ANSWER_GAP },
  answerText: { ...type.body, fontSize: ANSWER_SIZE, lineHeight: ANSWER_LINE_HEIGHT },
  spacer: { flex: 1 },
});
