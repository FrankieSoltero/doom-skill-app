/**
 * "Help with this card" (M9 plan H Task 6, spec 5.2; H1, H4–H6, H10): the sheet a card's help
 * icon (src/cards/HelpButton.tsx) opens. Two rows, "Test me" and "Go deeper", add a card: each
 * asks the API to add one to the running set (`POST /feed/extra`), named by the date and number
 * the data source served the set with (`currentSet()` of src/data). A third row, "Ask a question"
 * (M10 plan Q Task 9, decision Q10), swaps in the ask sheet (src/cards/AskSheet.tsx), which holds
 * the sheet's only text field.
 *
 * - An added card goes into the feed right after this card (`insertCard(card, index + 1)`); the
 *   sheet closes and the frame shows `copy.help.added`. When the feed has nowhere to put it (an
 *   answer already stored at the checkpoint after this card), the server still holds it: the
 *   sheet stays, says it may appear after a reload, and keeps both rows disabled until it closes.
 * - Nothing to add: "Go deeper" becomes the source sheet with all the node's passages; "Test me"
 *   shows one line. A card not in a set the learner is on (or an older server) reads the same.
 * - A full set (429) disables both rows until the sheet closes.
 * - A request that went offline or timed out may have added the card on the server: one line, and
 *   both rows stay disabled until the sheet closes, so a second tap cannot add a second card.
 * - Any other failure shows one line and enables the rows again.
 *
 * The rows are disabled while a request is in flight; the client never retries the POST. A
 * failure is logged by its kind only.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/errors';
import { requireApi } from '../api/query';
import { BottomSheet } from '../components/BottomSheet';
import { copy } from '../copy';
import { currentSet } from '../data';
import { addExtra, type ExtraAction, type ExtraOutcome } from '../data/feedActions';
import { useFeedStore } from '../feed/store';
import { logWarning } from '../log';
import { colors, space, type } from '../theme';
import { AskSheet } from './AskSheet';
import { SourceSheet } from './SourceSheet';

/** Where the sheet is: no answer yet, a request in flight, or the line an answer left. */
type Status = 'idle' | 'adding' | 'nothing' | 'full' | 'maybeAdded' | 'failed';

/** The line each status shows; none while idle. */
const LINES: Record<Exclude<Status, 'idle'>, string> = {
  adding: copy.help.adding,
  nothing: copy.help.nothing,
  full: copy.help.full,
  maybeAdded: copy.help.maybeAdded,
  failed: copy.help.failed,
};

/** The statuses that keep both rows disabled (module comment). */
const LOCKED: ReadonlySet<Status> = new Set(['adding', 'full', 'maybeAdded']);

/** A failure that may have reached the server: the card may already be added. */
const MAYBE_SENT: ReadonlySet<string> = new Set(['offline', 'timeout']);

/** The two rows, in the sheet's order, with their label and hint. */
const ROWS: readonly { action: ExtraAction; label: string; hint: string }[] = [
  { action: 'test', label: copy.help.testMe, hint: copy.help.testMeHint },
  { action: 'deeper', label: copy.help.deeper, hint: copy.help.deeperHint },
];

/** Asks the API for a card; with no served set there is nothing to add it to. */
function askForCard(cardId: string, action: ExtraAction): Promise<ExtraOutcome> {
  const set = currentSet();
  if (set === null) return Promise.resolve({ kind: 'notInFeed' });
  return addExtra(requireApi(), cardId, action, set);
}

/** The status a failed request leaves, logged by its kind. */
function failedStatus(error: unknown): Status {
  const kind = error instanceof ApiError ? error.kind : 'unknown';
  logWarning('extra_failed', { kind });
  return MAYBE_SENT.has(kind) ? 'maybeAdded' : 'failed';
}

/** One row of the sheet: its label over its hint, disabled while `locked`. */
function Row(props: { label: string; hint: string; locked: boolean; onPress: () => void }) {
  const { label, hint, locked, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        locked ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

type HelpSheetProps = {
  /** The server id of the card the sheet helps with. */
  cardId: string;
  /** That card's index in the set: an added card goes in right after it. */
  index: number;
  /** Called on Close, a tap above the sheet, the Android back button, or after an add. */
  onClose: () => void;
  /** Called once after a card was added, so the frame shows its line. */
  onAdded: () => void;
};

/** The sheet (module comment). */
export function HelpSheet({ cardId, index, onClose, onAdded }: HelpSheetProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [deeper, setDeeper] = useState(false);
  const [asking, setAsking] = useState(false);
  if (deeper) return <SourceSheet cardId={cardId} all onClose={onClose} />;
  if (asking) return <AskSheet cardId={cardId} onClose={onClose} />;

  const locked = LOCKED.has(status);
  const ask = async (action: ExtraAction) => {
    setStatus('adding');
    let outcome: ExtraOutcome;
    try {
      outcome = await askForCard(cardId, action);
    } catch (error) {
      setStatus(failedStatus(error));
      return;
    }
    if (outcome.kind === 'added') {
      if (useFeedStore.getState().insertCard(outcome.card, index + 1) === -1) {
        // The server holds the card but the feed had nowhere to put it: a reload shows it.
        setStatus('maybeAdded');
        return;
      }
      onClose();
      onAdded();
    } else if (outcome.kind === 'nothing' && action === 'deeper') {
      setDeeper(true);
    } else {
      setStatus(outcome.kind === 'full' ? 'full' : 'nothing');
    }
  };

  return (
    <BottomSheet
      title={copy.help.title}
      cancelLabel={copy.sources.close}
      onClose={onClose}
      testID="help-sheet"
    >
      {ROWS.map(({ action, label, hint }) => (
        <Row
          key={action}
          label={label}
          hint={hint}
          locked={locked}
          onPress={() => {
            void ask(action);
          }}
        />
      ))}
      <Row
        label={copy.qa.ask}
        hint={copy.qa.askHint}
        locked={locked}
        onPress={() => {
          setAsking(true);
        }}
      />
      {status === 'idle' ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.line}>{LINES[status]}</Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // At least 44 points tall: the minimum touch target.
  row: {
    minHeight: 44,
    justifyContent: 'center',
    gap: space[1],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink,
  },
  label: { ...type.button, color: colors.ink },
  // The project has no muted text token: the ink at 60% opacity, as the source sheet's lead-in.
  hint: { ...type.small, color: colors.ink, opacity: 0.6 },
  line: { ...type.small, color: colors.ink },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
