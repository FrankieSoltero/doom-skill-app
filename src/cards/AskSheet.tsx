/**
 * "Ask a question" (M10 plan Q Task 9, spec 3.4; decision Q10): the sheet the help sheet's third
 * row (src/cards/HelpSheet.tsx) swaps in, as "Go deeper" swaps in the source sheet. It holds a text
 * field and an Ask button, then (after asking) the passages found for the question, then the card's
 * questions (`GET /cards/{id}/questions` through TanStack Query, key `['cardQuestions', cardId]`).
 *
 * - Ask is enabled from 2 characters after trimming, and disabled while the question is sent
 *   (`POST /cards/{id}/questions`, sent once: the client never retries a POST).
 * - An asked question clears the field, goes to the top of the card's questions in the cache, and
 *   its passages show under "From the sources", each with its source's link row (the `https`-only
 *   opener of src/components/SourceLinks.tsx); no section when none were found.
 * - A refused ask shows its line under the field (the day's limit, not allowed, text refused); any
 *   other failure, offline included, shows the "could not send" line. The text stays for a retry.
 *   A failure is logged by its kind only, never the text.
 * - The questions show a loading line while they load; a failed load shows nothing there.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ApiError } from '../api/errors';
import { requireApi } from '../api/query';
import { BottomSheet } from '../components/BottomSheet';
import { Passage } from '../components/Passage';
import { PrimaryButton } from '../components/PrimaryButton';
import { SourceRows } from '../components/SourceLinks';
import { copy } from '../copy';
import {
  ask,
  listCardQuestions,
  qaOutcome,
  type AskPassage,
  type QaOutcome,
  type Question,
} from '../data/qa';
import { logWarning } from '../log';
import { colors, space, type } from '../theme';
import { QuestionList } from './QuestionList';

/** The fewest characters a question holds after trimming (the API's rule, D15). */
const MIN_LENGTH = 2;
/** The most characters a question holds (the API's rule, D15). */
const MAX_LENGTH = 300;
/** The field's height in points; a longer question scrolls inside it. */
const FIELD_HEIGHT = 96;
/** The share of the window's height the sheet's content may take before it scrolls. */
const MAX_HEIGHT_SHARE = 0.6;

/** The line a refused ask shows; every other outcome shows `copy.qa.failed`. */
const LINE_OF: Partial<Record<QaOutcome, string>> = {
  rateLimited: copy.qa.rateLimited,
  notAllowed: copy.qa.notAllowed,
  textRefused: copy.qa.textRefused,
};

/** The query key of a card's questions, shared by the list and the ask. */
const questionsKey = (cardId: string) => ['cardQuestions', cardId] as const;

/** The line a failed ask leaves, logged by its kind. */
function failedLine(error: unknown): string {
  const kind = error instanceof ApiError ? error.kind : 'unknown';
  logWarning('ask_failed', { kind });
  const outcome = qaOutcome(error);
  return (outcome === null ? undefined : LINE_OF[outcome]) ?? copy.qa.failed;
}

/** A section heading inside the sheet. */
function Heading({ text }: { text: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {text}
    </Text>
  );
}

/** The passages found for the asked question, each with its source's link; nothing for none. */
function AskPassages({ passages }: { passages: readonly AskPassage[] }) {
  if (passages.length === 0) return null;
  return (
    <View style={styles.section}>
      <Heading text={copy.qa.passagesTitle} />
      {passages.map((passage, index) => (
        // Two passages may share a text; the index keeps each key apart.
        <View key={`${String(index)}:${passage.text}`} style={styles.passage}>
          <Passage text={passage.text} />
          <SourceRows sources={[passage.source]} />
        </View>
      ))}
    </View>
  );
}

/** The card's questions (module comment). */
function CardQuestions({ cardId }: { cardId: string }) {
  const result = useQuery({
    queryKey: questionsKey(cardId),
    queryFn: () => listCardQuestions(requireApi(), cardId),
  });
  if (result.isPending) return <Text style={styles.line}>{copy.loading}</Text>;
  if (result.isError) return null;
  return <QuestionList questions={result.data} />;
}

/** The question being written and sending it (module comment). */
function useAsk(cardId: string) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [passages, setPassages] = useState<readonly AskPassage[]>([]);

  const send = async () => {
    setSending(true);
    setLine(null);
    try {
      const result = await ask(requireApi(), cardId, text.trim());
      setText('');
      setPassages(result.passages);
      client.setQueryData<Question[]>(questionsKey(cardId), (old) => [
        result.question,
        ...(old ?? []),
      ]);
    } catch (error) {
      setLine(failedLine(error));
    } finally {
      setSending(false);
    }
  };

  const ready = text.trim().length >= MIN_LENGTH && !sending;
  return { text, setText, ready, line, passages, send };
}

/** The sheet (module comment). */
export function AskSheet({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { text, setText, ready, line, passages, send } = useAsk(cardId);
  const { height } = useWindowDimensions();
  return (
    <BottomSheet
      title={copy.qa.ask}
      cancelLabel={copy.sources.close}
      onClose={onClose}
      testID="ask-sheet"
    >
      <ScrollView
        style={{ maxHeight: height * MAX_HEIGHT_SHARE }}
        contentContainerStyle={styles.content}
        // A tap on Ask while the keyboard is up presses it at once.
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <TextInput
            value={text}
            onChangeText={setText}
            accessibilityLabel={copy.qa.ask}
            placeholder={copy.qa.askPlaceholder}
            placeholderTextColor={colors.neutral[400]}
            multiline
            textAlignVertical="top"
            maxLength={MAX_LENGTH}
            cursorColor={colors.paper}
            selectionColor={colors.paper}
            style={styles.input}
          />
        </View>
        {line === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.line}>{line}</Text>
          </View>
        )}
        <PrimaryButton
          label={copy.qa.send}
          disabled={!ready}
          onPress={() => {
            void send();
          }}
        />
        <AskPassages passages={passages} />
        <View style={styles.section}>
          <Heading text={copy.qa.questionsTitle} />
          <CardQuestions cardId={cardId} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  section: { gap: space[2] },
  passage: { gap: space[1] },
  heading: { ...type.kicker, color: colors.ink },
  line: { ...type.small, color: colors.ink },
  // Paper text on an ink panel, as the written checkpoint's editor (src/cards/WrittenEditor.tsx).
  field: { backgroundColor: colors.ink },
  input: {
    ...type.body,
    color: colors.paper,
    height: FIELD_HEIGHT,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
});
