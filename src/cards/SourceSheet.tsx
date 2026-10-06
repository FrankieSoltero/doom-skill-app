/**
 * "Show me the source" (M9 plan H Task 5, spec 5.2; H8, H12): the sheet a card's book icon
 * (src/cards/SourcesButton.tsx) opens, and the help sheet's "Go deeper" with nothing to add opens
 * with `all`. It shows the card's sources at once; for a card with a server id it also loads the
 * passages of the card's node (`GET /cards/{id}/source`, `?all=true` with `all`) through
 * TanStack Query, keyed by card id and kept for the session, and shows the passage the card was
 * built from first, then the others, then the sources. A passage is drawn as served, with its
 * lead-in muted above it and one line, its source's title and licence, that opens the source
 * through the sources sheet's `https`-only opener. Any failure to load (an older server's 404,
 * any other `ApiError`, an answer the app cannot read) leaves the sources and one line; there is
 * no retry button, a reopen asks again. A card without an id (the demo cards) asks nothing.
 */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { requireApi } from '../api/query';
import { BottomSheet } from '../components/BottomSheet';
import { Passage } from '../components/Passage';
import { openSource, SourceRows } from '../components/SourcesSheet';
import { copy } from '../copy';
import { fetchCardSource, type CardPassages } from '../data/feedActions';
import { colors, space, type } from '../theme';
import { useCardSources } from './SourcesButton';

type CardPassage = CardPassages['passages'][number];

/** Between a passage source's title and its licence. */
const SEPARATOR = ' · ';
/** The share of the window's height the sheet's content may take before it scrolls. */
const MAX_HEIGHT_SHARE = 0.6;

/** A passage source's line: its title, and its licence when one was recorded. */
function sourceLine({ title, license }: CardPassage['source']): string {
  return license === null ? title : `${title}${SEPARATOR}${license}`;
}

/** One passage: one accessible element (lead-in and text), then the link to its source. */
function SourcePassage({ passage }: { passage: CardPassage }) {
  const { leadIn, text, source } = passage;
  return (
    <View style={styles.passage}>
      <View
        testID="source-passage"
        accessible
        accessibilityLabel={leadIn === '' ? text : `${leadIn} ${text}`}
        style={styles.passage}
      >
        {leadIn === '' ? null : <Text style={styles.leadIn}>{leadIn}</Text>}
        <Passage text={text} />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={copy.source.open}
        onPress={() => {
          openSource(source.url);
        }}
        style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
      >
        <Text style={styles.linkText}>{sourceLine(source)}</Text>
      </Pressable>
    </View>
  );
}

/** A heading and what goes under it. */
function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      {children}
    </View>
  );
}

/** A heading over `passages`; nothing for none. */
function PassageGroup({ heading, passages }: { heading: string; passages: CardPassage[] }) {
  if (passages.length === 0) return null;
  return (
    <Section heading={heading}>
      {passages.map((passage, index) => (
        // Two passages may share a text; the index keeps each key apart.
        <SourcePassage key={`${String(index)}:${passage.text}`} passage={passage} />
      ))}
    </Section>
  );
}

/** The passages of the card `cardId` (module comment); mounted only for a card with an id. */
function Passages({ cardId, all }: { cardId: string; all: boolean }) {
  const result = useQuery({
    queryKey: ['cardSource', cardId, all],
    queryFn: () => fetchCardSource(requireApi(), cardId, all),
    // Kept for the session: a card's passages do not change while it is on screen.
    staleTime: Infinity,
    gcTime: Infinity,
  });
  if (result.isPending) return <Text style={styles.note}>{copy.source.loading}</Text>;
  if (result.isError) return <Text style={styles.note}>{copy.source.unavailable}</Text>;
  const { passages } = result.data;
  return (
    <>
      <PassageGroup heading={copy.source.own} passages={passages.filter((p) => p.own)} />
      <PassageGroup heading={copy.source.more} passages={passages.filter((p) => !p.own)} />
    </>
  );
}

/** The sheet (module comment). `cardId` null (a demo card) shows the sources only. */
export function SourceSheet({
  cardId,
  all,
  onClose,
}: {
  cardId: string | null;
  all?: boolean;
  onClose: () => void;
}) {
  const sources = useCardSources();
  const { height } = useWindowDimensions();
  return (
    <BottomSheet
      title={copy.source.title}
      cancelLabel={copy.sources.close}
      onClose={onClose}
      testID="sources-sheet"
    >
      <ScrollView
        style={{ maxHeight: height * MAX_HEIGHT_SHARE }}
        contentContainerStyle={styles.content}
      >
        {cardId === null ? null : <Passages cardId={cardId} all={all === true} />}
        {sources.length === 0 ? null : (
          <Section heading={copy.source.links}>
            <SourceRows sources={sources} />
          </Section>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  section: { gap: space[2] },
  heading: { ...type.kicker, color: colors.ink },
  passage: { gap: space[1] },
  // The project has no muted text token: the ink at 60% opacity, as the plan asks.
  leadIn: { ...type.small, color: colors.ink, opacity: 0.6 },
  note: { ...type.small, color: colors.ink },
  // At least 44 points tall: the minimum touch target.
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...type.caption, color: colors.ink, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});
