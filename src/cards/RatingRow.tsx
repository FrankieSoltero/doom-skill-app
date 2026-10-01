import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import type { CardAnswer } from '../feed/answers';
import { border, cardTheme, colors, fonts, hardShadow, type } from '../theme';

// Rating values from docs/design/card-feed/README.md:119 and, where it gives none, the prototype
// docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html, that the theme does not hold.
/** Height of a rating button, README.md:119 ("each 60px"). Above the 44pt minimum touch target. */
const BUTTON_HEIGHT = 60;
/** Space between the caption and the buttons, prototype line 200 ("gap:6px"). */
const CAPTION_GAP = 6;
/** Space between the buttons, prototype line 202 ("gap:6px"). */
const BUTTON_GAP = 6;
/** Space between a button's label and its interval, prototype line 204 ("gap:1px"). */
const LABEL_GAP = 1;
/** The label's size, prototype line 205 ("font-size:17px"), in the heading font. */
const LABEL_SIZE = 17;
/** The interval's size, prototype line 206 ("font-size:11px"), in the body font. */
const INTERVAL_SIZE = 11;
/** 17px and 11px at the prototype's body line height of 1.55 (`body { line-height: 1.55 }`). */
const LABEL_LINE_HEIGHT = 26;
const INTERVAL_LINE_HEIGHT = 17;
/** How far a button moves right and down while pressed, prototype line 204 ("translate(2px,2px)"). */
const PRESSED_OFFSET = 2;

/** A stored review rating: the position of the button the learner pressed. */
export type Rating = NonNullable<Extract<CardAnswer, { kind: 'review' }>['rating']>;

/** The positions a rating can take, so the row shows at most the first four of a card's ratings. */
const POSITIONS: readonly Rating[] = [0, 1, 2, 3];

type RatingRowProps = {
  /** The card's ratings, each `[label, interval]`, shown as given and in order. */
  ratings: readonly (readonly [string, string])[];
  /** The stored rating, or null before one. Once set, every button is locked. */
  rating: Rating | null;
  /** Called with the position of a pressed button, while no rating is stored. */
  onRate: (rating: Rating) => void;
};

type RatingButtonProps = {
  label: string;
  interval: string;
  /** True for the stored rating: ink fill, yellow text. */
  selected: boolean;
  /** True once any rating is stored: no shadow, no presses. */
  locked: boolean;
  onPress: () => void;
};

/**
 * One rating (README.md:18, :119): the label over its interval on a paper face with a 1.5pt ink
 * border and a 2pt hard shadow drawn as a sibling view. While pressed it moves 2 points and drops
 * the shadow; once rated every button drops it.
 */
function RatingButton({ label, interval, selected, locked, onPress }: RatingButtonProps) {
  const face = selected ? styles.selectedFace : null;
  const ink = { color: selected ? cardTheme.review.bg : colors.ink };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.ratingLabel(label, interval)}
      accessibilityState={{ selected, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => (pressed ? styles.pressed : null)}
    >
      {({ pressed }: PressableStateCallbackType) => (
        <>
          {locked || pressed ? null : <View testID="rating-shadow" style={styles.shadow} />}
          <View testID="rating-face" style={[styles.face, face]}>
            <Text style={[styles.label, ink]}>{label}</Text>
            <Text style={[styles.interval, ink]}>{interval}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

/**
 * The foot of a revealed review card (README.md:119-121): the caption "How well did you
 * remember?" over a row of up to four rating buttons in equal columns, from the card's first
 * four ratings. The stored rating shows ink with yellow text. Render it inside a `CardFrame`.
 */
export function RatingRow({ ratings, rating, onRate }: RatingRowProps) {
  const color = useCardTextColor();
  const shown = POSITIONS.flatMap((position) => {
    const pair = ratings[position];
    return pair === undefined ? [] : [{ position, label: pair[0], interval: pair[1] }];
  });

  return (
    <View testID="rating-row" style={styles.row}>
      <Text style={[type.caption, { color }]}>{copy.howWell}</Text>
      <View testID="rating-buttons" style={styles.buttons}>
        {shown.map(({ position, label, interval }) => (
          <View key={position} testID="rating-cell" style={styles.cell}>
            <RatingButton
              label={label}
              interval={interval}
              selected={position === rating}
              locked={rating !== null}
              onPress={() => {
                onRate(position);
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: CAPTION_GAP },
  buttons: { flexDirection: 'row', gap: BUTTON_GAP },
  cell: { flex: 1 },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  shadow: {
    position: 'absolute',
    top: hardShadow.small,
    left: hardShadow.small,
    right: -hardShadow.small,
    bottom: -hardShadow.small,
    backgroundColor: colors.ink,
  },
  face: {
    height: BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: LABEL_GAP,
    borderWidth: border.strong,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  selectedFace: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.heading, fontSize: LABEL_SIZE, lineHeight: LABEL_LINE_HEIGHT },
  interval: { fontFamily: fonts.body, fontSize: INTERVAL_SIZE, lineHeight: INTERVAL_LINE_HEIGHT },
});
