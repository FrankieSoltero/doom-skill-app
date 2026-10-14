import { StyleSheet, Text } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import type { ConceptCard } from '../data';
import { type } from '../theme';

/**
 * Why a card may be off, as the API serves it on every feed card but the checkpoint (card quality
 * loop, spec 4): a learner flagged it, or a rebuild of it is running.
 */
export type Notice = NonNullable<ConceptCard['notice']>;

const LINES: Readonly<Record<Notice, string>> = {
  rebuilding: copy.card.noticeRebuilding,
  flagged: copy.card.noticeFlagged,
};

/**
 * The one line a flagged or rebuilding card shows under its kicker (src/components/CardFrame.tsx),
 * in the card's text colour; nothing for a clean card. It sits in the card's flow, so it never
 * covers the card or takes a touch.
 */
export function CardNotice({ notice }: { notice: Notice | null }) {
  const color = useCardTextColor();
  if (notice === null) return null;
  return (
    <Text accessibilityRole="text" style={[styles.line, { color }]}>
      {LINES[notice]}
    </Text>
  );
}

const styles = StyleSheet.create({ line: type.caption });
