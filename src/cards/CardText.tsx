import { StyleSheet, Text } from 'react-native';

import { BoldText } from '../components/BoldText';
import { useCardTextColor } from '../components/cardTextColor';
import { type } from '../theme';

/** Card title sizes: `l` for concept and review, `m` for quiz and predict, `s` for the rest. */
const TITLE_STYLES = StyleSheet.create({
  l: type.cardTitleL,
  m: type.cardTitleM,
  s: type.cardTitleS,
});

type CardTitleProps = {
  children: string;
  size: keyof typeof TITLE_STYLES;
};

/**
 * A card's title in the theme title style for `size`, in the enclosing card frame's text color.
 * A screen reader hears it as a header. Render it inside a `CardFrame`.
 */
export function CardTitle({ children, size }: CardTitleProps) {
  const color = useCardTextColor();
  return (
    <Text accessibilityRole="header" style={[TITLE_STYLES[size], { color }]}>
      {children}
    </Text>
  );
}

/**
 * A card's body text in the theme body style and the enclosing card frame's text color. Text
 * between a pair of `**` is bold (see `BoldText`). Render it inside a `CardFrame`.
 */
export function CardBody({ text }: { text: string }) {
  const color = useCardTextColor();
  return <BoldText text={text} style={[type.body, { color }]} />;
}
