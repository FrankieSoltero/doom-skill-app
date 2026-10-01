import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CardFrame } from '../components/CardFrame';
import { useCardTextColor } from '../components/cardTextColor';
import { CodeBlock } from '../components/CodeBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import type { ConceptCard as ConceptCardData } from '../data';
import { border, colors, fonts, motion, type } from '../theme';
import { cardKickerText, cardMetaText } from './cardLabels';
import { CardBody, CardTitle } from './CardText';

// Cycle tile values the theme does not hold, from docs/design/card-feed/README.md:55-56 and,
// where it gives none, reference/LearnLoop Card Feed v2.dc.html:87-91.
/** Space between tiles, README.md:55 ("6px gap"). The nearest theme step, space[2], is 6.8. */
const TILE_GAP = 6;
/** Inner padding of a tile, prototype line 89 ("padding:8px"). */
const TILE_PADDING = 8;
/** Space between a tile's label and its note, prototype line 89 ("gap:2px"). */
const TILE_INNER_GAP = 2;
/** How far the highlighted tile rises, README.md:56 ("translateY(-3)"). */
const TILE_LIFT = -3;
/** The note's size, README.md:55 ("24px heading"). */
const NOTE_FONT_SIZE = 24;
/** The note's line height: 24px at the prototype's body line height of 1.55, rounded. */
const NOTE_LINE_HEIGHT = 37;

type ConceptCardProps = {
  card: ConceptCardData;
  /** True while this card is the one on screen. Only then does the highlight move. */
  active: boolean;
  /** Called when the learner presses Got it. */
  onNext: () => void;
};

/**
 * The index of the highlighted cycle tile. While `active`, it moves to the next tile every
 * `motion.conceptCycle` ms and wraps after the last. Otherwise no timer runs and it is 0: the
 * timer's cleanup resets it. With a single tile no timer runs either.
 */
function useCycleHighlight(count: number, active: boolean): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || count < 2) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, motion.conceptCycle);
    return () => {
      clearInterval(timer);
      setIndex(0);
    };
  }, [active, count]);

  return index;
}

type CycleTilesProps = { cycles: readonly string[]; highlighted: number };

/**
 * One tile per cycle, in a row of equal widths (README.md:55-56): a label and the note. The
 * highlighted tile has a paper fill and sits 3 points higher. A screen reader reads the row as
 * one text; the moving highlight is decoration and is not announced.
 */
function CycleTiles({ cycles, highlighted }: CycleTilesProps) {
  const color = useCardTextColor();
  return (
    <View testID="cycle-tiles" style={styles.tiles} accessible accessibilityRole="text">
      {cycles.map((note, index) => (
        <View
          key={index}
          testID="cycle-tile"
          style={[styles.tile, index === highlighted ? styles.highlighted : null]}
        >
          <Text style={[styles.label, { color }]}>{copy.cycleLabel(index + 1)}</Text>
          <Text style={[styles.note, { color }]}>{note}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The concept card (README.md:51-57): kicker row, title, body, a code block, the cycle tiles, a
 * flex spacer, then Got it. It is always answered; the screen decides what pressing Got it does.
 *
 * A topic without Strudel may send no code (M6 hardening Task 8): the code block shows only with a
 * snippet, and the tiles only with a snippet and cycles. The spacer still keeps Got it at the foot.
 */
export function ConceptCard({ card, active, onNext }: ConceptCardProps) {
  const { snippet } = card;
  const cycles = snippet === undefined ? [] : (card.cycles ?? []);
  const highlighted = useCycleHighlight(cycles.length, active);

  return (
    <CardFrame type="concept" kicker={cardKickerText(card)} meta={cardMetaText(card.estSeconds)}>
      <CardTitle size="l">{card.title}</CardTitle>
      <CardBody text={card.body} />
      {snippet === undefined ? null : (
        <CodeBlock code={snippet} comment={card.snippetComment ?? ''} />
      )}
      {cycles.length === 0 ? null : <CycleTiles cycles={cycles} highlighted={highlighted} />}
      <View testID="concept-spacer" style={styles.spacer} />
      <PrimaryButton label={copy.gotIt} onPress={onNext} />
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: TILE_GAP },
  tile: {
    flex: 1,
    borderWidth: border.strong,
    borderColor: colors.ink,
    padding: TILE_PADDING,
    gap: TILE_INNER_GAP,
  },
  highlighted: { backgroundColor: colors.paper, transform: [{ translateY: TILE_LIFT }] },
  label: type.kicker,
  note: { fontFamily: fonts.heading, fontSize: NOTE_FONT_SIZE, lineHeight: NOTE_LINE_HEIGHT },
  spacer: { flex: 1 },
});
