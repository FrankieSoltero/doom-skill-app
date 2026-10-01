import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlagButton, useFlaggable, useThanksLine } from '../cards/FlagButton';
import { copy } from '../copy';
import { border, cardTheme, colors, hardShadow, space, type } from '../theme';
import type { CardType } from '../theme';
import { CardTextColorProvider } from './cardTextColor';
import { CornerMarks } from './CornerMarks';
import { Toast } from './Toast';

/**
 * Inner padding of every card, docs/design/card-feed/README.md:46. The nearest theme step,
 * space[6], is 20.4.
 */
const CARD_PADDING = 20;

type CardFrameProps = {
  /** Picks the frame's fill, shadow and kicker colors from `cardTheme`. */
  type: CardType;
  /** Card type and node, shown at the left of the kicker row. */
  kicker: string;
  /** Estimated time, shown at the right of the kicker row. Nothing is rendered when omitted. */
  meta?: string;
  children: ReactNode;
};

/**
 * The frame every card sits in (docs/design/card-feed/README.md:17-20, 46-47): a filled box with
 * a 1.5pt ink border, a hard offset shadow drawn as a sibling view behind it, "+" corner marks,
 * and the kicker row above the card's own content. Everything inside it reads the card's text
 * color (`cardTheme[type].fg`) through `useCardTextColor`. The frame's own corner marks do not:
 * they are ink on every card, README.md:19.
 *
 * A card the feed drew from the API gets the flag action at the right end of the kicker row
 * (src/cards/FlagButton.tsx); once a reason is chosen, the thank-you line shows over the bottom
 * of the frame for a few seconds. The demo cards and the Summary have no flag action.
 */
export function CardFrame({ type: cardType, kicker, meta, children }: CardFrameProps) {
  const theme = cardTheme[cardType];
  const kickerStyle = [styles.kicker, { color: theme.kicker }];
  const [thanked, showThanks] = useThanksLine();
  const flaggable = useFlaggable();

  return (
    <CardTextColorProvider color={theme.fg}>
      <View testID="card-frame" style={styles.frame}>
        <View
          testID="card-frame-shadow"
          style={[styles.shadow, { backgroundColor: theme.shadow }]}
        />
        <View testID="card-frame-body" style={[styles.body, { backgroundColor: theme.bg }]}>
          <View testID="card-kicker-row" style={styles.kickerRow}>
            <Text style={[kickerStyle, styles.lead]}>{kicker}</Text>
            {meta ? <Text style={kickerStyle}>{meta}</Text> : null}
            {flaggable ? <FlagButton onFlagged={showThanks} /> : null}
          </View>
          {children}
        </View>
        <CornerMarks tone="ink" />
        <Toast message={copy.flag.thanks} visible={thanked} />
      </View>
    </CardTextColorProvider>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  shadow: {
    position: 'absolute',
    top: hardShadow.card,
    left: hardShadow.card,
    right: -hardShadow.card,
    bottom: -hardShadow.card,
  },
  body: {
    flex: 1,
    borderWidth: border.strong,
    borderColor: colors.ink,
    padding: CARD_PADDING,
    // README.md:46 gives a column gap of 12-14; space[4] (13.6) is the theme step in that range.
    gap: space[4],
  },
  kickerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  // The kicker takes the row's free width, so the meta and the flag action sit at its right end.
  lead: { flex: 1 },
  kicker: type.kicker,
});
