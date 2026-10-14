import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/errors';
import { signOut } from '../../src/auth/useSession';
import { ErrorScreen } from '../../src/components/ErrorScreen';
import { LoadingState } from '../../src/components/LoadingState';
import { OutlineButton } from '../../src/components/OutlineButton';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { logWarning } from '../../src/log';
import { DeleteAccountSheet } from '../../src/profile/DeleteAccountSheet';
import { LeaderboardSetting } from '../../src/profile/LeaderboardSetting';
import type { Profile } from '../../src/profile/me';
import { MinutesPicker } from '../../src/profile/MinutesPicker';
import { NAME_MAX, nameProblem } from '../../src/profile/nameRules';
import { ProfileField, Setting } from '../../src/profile/ProfileField';
import { ReminderSetting } from '../../src/profile/ReminderSetting';
import { SourceLink } from '../../src/profile/SourceLink';
import { deviceTimezone, useProfile, type ProfilePatch } from '../../src/profile/useProfile';
import { colors, space, type } from '../../src/theme';

type FormProps = { profile: Profile; update: (patch: ProfilePatch) => Promise<void> };

/** The line for each way a name breaks the display-name rule (src/profile/nameRules.ts). */
const NAME_PROBLEM_LINES = {
  short: copy.profile.nameShort,
  long: copy.profile.nameLong,
  chars: copy.profile.nameChars,
} as const;

/**
 * The line for a refused `patch`: a 409 on a name is a taken name; a 422 is the opt-in without a
 * name when the request turned it on and carried none, else a name the API does not allow; any
 * other refusal is the one fixed line. The API's bodies are fixed texts, so the status decides.
 */
function failureLine(patch: ProfilePatch, error: unknown): string {
  if (!(error instanceof ApiError)) return copy.profile.saveFailed;
  const naming = patch.display_name !== undefined;
  if (naming && error.kind === 'conflict') return copy.profile.nameTaken;
  if (error.status !== 422) return copy.profile.saveFailed;
  if (patch.leaderboard_opt_in === true && (patch.display_name ?? null) === null) {
    return copy.profile.nameRequired;
  }
  return naming ? copy.profile.nameNotAllowed : copy.profile.saveFailed;
}

/**
 * The display name, saved trimmed when editing ends; a blank one clears it. A name that breaks the
 * rule shows why under the field and is not sent.
 */
function NameField({
  name,
  save,
}: {
  name: string | null;
  save: (patch: ProfilePatch) => unknown;
}) {
  const [draft, setDraft] = useState(name ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const commit = () => {
    const found = nameProblem(draft);
    setProblem(found === null ? null : NAME_PROBLEM_LINES[found]);
    if (found !== null) return;
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== name) void save({ display_name: next });
  };
  return (
    <View style={styles.field}>
      <ProfileField
        label={copy.profile.displayName}
        value={draft}
        onChangeText={setDraft}
        onEndEditing={commit}
        placeholder={copy.profile.displayNamePlaceholder}
        maxLength={NAME_MAX}
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
      />
      {problem === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.text}>{problem}</Text>
        </View>
      )}
    </View>
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
 * The loaded profile's settings, each saved as it changes; a refused change shows one line, which
 * names the reason for a refused display name or leaderboard opt-in (`failureLine`).
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
      setFailure(failureLine(patch, error));
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
      <LeaderboardSetting
        optedIn={profile.leaderboard_opt_in}
        hasName={profile.display_name !== null}
        save={save}
      />
      <Setting label={copy.profile.dailyMinutes}>
        <MinutesPicker
          value={profile.daily_minutes}
          onChange={(minutes) => void save({ daily_minutes: minutes })}
        />
      </Setting>
      <ReminderSetting key={profile.push_time ?? 'off'} pushTime={profile.push_time} save={save} />
      <TimezoneSetting timezone={profile.timezone} save={save} />
      <SourceLink />
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
      <Text style={styles.note}>{copy.profile.attribution}</Text>
    </ScrollView>
  );
}

/**
 * The Profile tab (README.md:165-168): the display name, the daily time budget (5 to 60 minutes),
 * the daily reminder and its time (a local notification, src/profile/reminders.ts), and the
 * timezone, offering the device's, all through `GET /me` and `PATCH /me`; then the app's source
 * link (src/profile/SourceLink.tsx, M7 open client); then Sign out, and Delete account, which
 * opens a sheet that asks the person to type `delete`
 * (src/profile/DeleteAccountSheet.tsx) before `DELETE /me`; then the footer, the topic catalog's
 * attribution (plan C9, apps/mobile/NOTICE). While the profile loads a busy line
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
  field: { gap: space[2] },
  text: { ...type.body, color: colors.ink },
  note: { ...type.caption, color: colors.neutral[700] },
});
