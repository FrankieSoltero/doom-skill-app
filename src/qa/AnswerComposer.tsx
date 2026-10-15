/**
 * The answer field under a question the learner can answer (M10 plan Q Task 11, spec 3.4): a
 * multiline field and the Answer button.
 *
 * - Answer is enabled from 2 characters after trimming, and disabled while the answer is sent
 *   (`POST /questions/{id}/answers`, sent once: the client never retries a POST).
 * - A sent answer clears the field and marks the inbox and the card's questions stale, so both are
 *   read again (the answered question leaves the learner's list).
 * - A refused answer shows its line under the field (the day's limit, not allowed, text refused);
 *   any other failure, offline included, shows the "could not send" line. The text stays for a
 *   retry. A failure is logged by its kind only, never the text.
 * - While the API cannot be reached (`useOnline`), Answer is disabled and the line under the field
 *   says "Needs a connection" (offline-topic plan O6); nothing is sent.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { requireApi } from '../api/query';
import { useOnline } from '../api/useOnline';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import { answerQuestion, qaOutcome, type Question } from '../data/qa';
import { kindOf } from '../feed/outboxQueue';
import { logWarning } from '../log';
import { border, colors, space, type } from '../theme';
import { INBOX_KEY } from './useInbox';

/** The fewest characters an answer holds after trimming (the API's rule, D15). */
const MIN_LENGTH = 2;
/** The most characters an answer holds (the API's rule, D15). */
const MAX_LENGTH = 600;
/** The field's height in points; a longer answer scrolls inside it. */
const FIELD_HEIGHT = 96;

/** The line a failed answer shows (module comment). */
function failureLine(error: unknown): string {
  switch (qaOutcome(error)) {
    case 'rateLimited':
      return copy.qa.rateLimited;
    case 'notAllowed':
      return copy.qa.notAllowed;
    case 'textRefused':
      return copy.qa.answerRefused;
    default:
      return copy.qa.failed;
  }
}

/** The answer being written and sending it (module comment). */
function useAnswer(question: Question) {
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setLine(null);
    try {
      await answerQuestion(requireApi(), question.id, text.trim());
      setText('');
      void cache.invalidateQueries({ queryKey: INBOX_KEY });
      void cache.invalidateQueries({ queryKey: ['cardQuestions', question.cardId] });
    } catch (error) {
      logWarning('answer_failed', { kind: kindOf(error) });
      setLine(failureLine(error));
    } finally {
      setSending(false);
    }
  };

  const online = useOnline();
  const ready = online && text.trim().length >= MIN_LENGTH && !sending;
  return { text, setText, ready, line: online ? line : copy.needsConnection, send };
}

/** The composer (module comment). */
export function AnswerComposer({ question }: { question: Question }) {
  const { text, setText, ready, line, send } = useAnswer(question);
  return (
    <View style={styles.composer}>
      <TextInput
        value={text}
        onChangeText={setText}
        accessibilityLabel={copy.qa.answerPlaceholder}
        placeholder={copy.qa.answerPlaceholder}
        placeholderTextColor={colors.neutral[600]}
        multiline
        textAlignVertical="top"
        maxLength={MAX_LENGTH}
        style={styles.input}
      />
      {line === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.line}>{line}</Text>
        </View>
      )}
      <PrimaryButton
        label={copy.qa.sendAnswer}
        disabled={!ready}
        onPress={() => {
          void send();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: space[2], paddingTop: space[1] },
  // An ink-bordered field on paper, as the Explore tab's search field.
  input: {
    ...type.body,
    color: colors.ink,
    height: FIELD_HEIGHT,
    padding: space[3],
    borderWidth: border.strong,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  line: { ...type.small, color: colors.ink },
});
