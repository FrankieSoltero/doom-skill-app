import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut } from '../../src/auth/useSession';
import { ErrorScreen } from '../../src/components/ErrorScreen';
import { LoadingState } from '../../src/components/LoadingState';
import { OutlineButton } from '../../src/components/OutlineButton';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { logWarning } from '../../src/log';
import { DeleteAccountSheet } from '../../src/profile/DeleteAccountSheet';
import type { Profile } from '../../src/profile/me';
import { MinutesPicker } from '../../src/profile/MinutesPicker';
import { ProfileField, Setting } from '../../src/profile/ProfileField';
import { ReminderSetting } from '../../src/profile/ReminderSetting';
import { deviceTimezone, useProfile, type ProfilePatch } from '../../src/profile/useProfile';
import { colors, space, type } from '../../src/theme';

/** The API's longest display name. */
const MAX_NAME_LENGTH = 40;

type FormProps = { profile: Profile; update: (patch: ProfilePatch) => Promise<void> };

/** The display name, saved trimmed when editing ends; a blank one clears it. */
function NameField({
  name,
  save,
}: {
  name: string | null;
  save: (patch: ProfilePatch) => unknown;
}) {
  const [draft, setDraft] = useState(name ?? '');
  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== name) void save({ display_name: next });
  };
  return (
    <ProfileField
      label={copy.profile.displayName}
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      placeholder={copy.profile.displayNamePlaceholder}
      maxLength={MAX_NAME_LENGTH}
      autoComplete="name"
      textContentType="name"
      returnKeyType="done"
    />
  );
}

/** The profile's timezone, with the device's offered when the two differ. */
function TimezoneSetting({
  timezone,
  save,
}: {
  timezone: string;
  save: (patch: ProfilePatch) => unknown;
}) {
  const device = deviceTimezone();
  return (
    <Setting label={copy.profile.timezone}>
      <Text style={styles.text}>{timezone}</Text>
      {device === timezone ? null : (
        <OutlineButton
          label={copy.profile.useDeviceTimezone(device)}
          onPress={() => void save({ timezone: device })}
        />
      )}
    </Setting>
  );
}

/**
 * The loaded profile's settings, each saved as it changes; a refused change shows one fixed line.
 */
function ProfileForm({ profile, update }: FormProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const save = async (patch: ProfilePatch): Promise<boolean> => {
    setFailure(null);
    try {
      await update(patch);
      return true;
    } catch (error) {
      logWarning('profile_save_failed', { kind: error instanceof Error ? error.name : 'unknown' });
      setFailure(copy.profile.saveFailed);
      return false;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {failure === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.text}>{failure}</Text>
        </View>
      )}
      <NameField name={profile.display_name} save={save} />
      <Setting label={copy.profile.dailyMinutes}>
        <MinutesPicker
          value={profile.daily_minutes}
          onChange={(minutes) => void save({ daily_minutes: minutes })}
        />
      </Setting>
      <ReminderSetting key={profile.push_time ?? 'off'} pushTime={profile.push_time} save={save} />
      <TimezoneSetting timezone={profile.timezone} save={save} />
      <OutlineButton label={copy.profile.signOut} onPress={() => void signOut()} />
      <OutlineButton
        label={copy.profile.deleteAccount}
        onPress={() => {
          setDeleting(true);
        }}
      />
      {deleting ? (
        <DeleteAccountSheet
          onClose={() => {
            setDeleting(false);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * The Profile tab (README.md:165-168): the display name, the daily time budget (5 to 60 minutes),
 * the daily reminder and its time (a local notification, src/profile/reminders.ts), and the
 * timezone, offering the device's, all through `GET /me` and `PATCH /me`; then Sign out, and
 * Delete account, which opens a sheet that asks the person to type `delete`
 * (src/profile/DeleteAccountSheet.tsx) before `DELETE /me`. While the profile loads a busy line
 * shows; a failed load shows a fixed line with Retry.
 */
export default function ProfileScreen() {
  const state = useProfile();
  let body;
  if (state.profile !== undefined) {
    body = <ProfileForm profile={state.profile} update={state.update} />;
  } else if (state.status === 'error') {
    body = (
      <ErrorScreen
        message={copy.profile.loadFailed}
        actionLabel={copy.retry}
        onAction={state.retry}
      />
    );
  } else {
    body = <LoadingState label={copy.loading} />;
  }

  return (
    <TabScreen testID="profile-screen" title={copy.profile.title}>
      {body}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[6], paddingBottom: space[8] },
  text: { ...type.body, color: colors.ink },
});
