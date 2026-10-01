import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { copy } from '../copy';
import { logWarning } from '../log';
import { colors, space, type } from '../theme';
import { ProfileField, Setting } from './ProfileField';
import { cancelDailyReminder, isReminderTime, scheduleDailyReminder } from './reminders';
import type { ProfilePatch } from './useProfile';

/** The time a reminder turned on for the first time gets, README.md:168 ("08:30 PM"). */
const DEFAULT_TIME = '20:30';

type ReminderSettingProps = {
  /** The profile's `push_time` (`HH:MM:SS`), or `null` while the reminder is off. */
  pushTime: string | null;
  /** Saves a change to the profile; false when it was refused. */
  save: (patch: ProfilePatch) => Promise<boolean>;
};

/**
 * The daily reminder (README.md:168): a switch, and while it is on, its time (`HH:MM`). Turning it
 * on schedules the local notification first (which asks for permission then, and only then) and
 * saves the time to the profile; a denied permission shows one fixed line and leaves it off.
 * Turning it off cancels the notification and clears the time. A new time is checked, scheduled,
 * then saved. The parent keys this on `pushTime`, so the field starts from each saved time.
 */
export function ReminderSetting({ pushTime, save }: ReminderSettingProps) {
  const on = pushTime !== null;
  const saved = pushTime?.slice(0, 5) ?? DEFAULT_TIME;
  const [draft, setDraft] = useState(saved);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Schedules the reminder at `time` and saves it; cancels it again when the save is refused. */
  const scheduleAndSave = async (time: string) => {
    if ((await scheduleDailyReminder(time)) === 'denied') {
      setLine(copy.profile.remindersDenied);
      return;
    }
    if (!(await save({ push_time: time }))) await cancelDailyReminder();
  };
  const run = async (work: () => Promise<void>) => {
    setLine(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      logWarning('reminder_change_failed', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
      setLine(copy.profile.saveFailed);
    } finally {
      setBusy(false);
    }
  };
  const turn = (next: boolean) =>
    run(async () => {
      if (next) {
        await scheduleAndSave(isReminderTime(draft) ? draft : DEFAULT_TIME);
        return;
      }
      await cancelDailyReminder();
      await save({ push_time: null });
    });
  const moveTo = () => {
    if (draft === saved) return;
    if (!isReminderTime(draft)) {
      setLine(copy.profile.invalidTime);
      return;
    }
    void run(() => scheduleAndSave(draft));
  };

  return (
    <View style={styles.root}>
      <Setting label={copy.profile.reminder}>
        <View style={styles.switchRow}>
          <Text style={styles.text}>{copy.profile.reminderSwitch}</Text>
          <Switch
            accessibilityLabel={copy.profile.reminderSwitch}
            value={on}
            disabled={busy}
            onValueChange={(next) => void turn(next)}
            trackColor={{ false: colors.neutral[300], true: colors.lime }}
            thumbColor={colors.paper}
            ios_backgroundColor={colors.neutral[300]}
          />
        </View>
      </Setting>
      {on ? (
        <ProfileField
          label={copy.profile.reminderTime}
          value={draft}
          onChangeText={setDraft}
          onEndEditing={moveTo}
          placeholder={copy.profile.reminderTimePlaceholder}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          editable={!busy}
        />
      ) : null}
      {line === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.text}>{line}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { ...type.body, color: colors.ink, flexShrink: 1 },
});
