import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { copy } from '../copy';
import { colors, space, type } from '../theme';
import { Setting } from './ProfileField';
import type { ProfilePatch } from './useProfile';

type LeaderboardSettingProps = {
  /** The profile's `leaderboard_opt_in`. */
  optedIn: boolean;
  /** Whether the profile has a display name, which a leaderboard row shows. */
  hasName: boolean;
  /** Saves a change to the profile; false when it was refused (the parent shows why). */
  save: (patch: ProfilePatch) => Promise<boolean>;
};

/**
 * The leaderboard opt-in (M10 plan P, spec 3.2): a switch bound to the profile's
 * `leaderboard_opt_in`, saved as it changes, and the note on what the display name is shown on.
 * Turning it on without a display name shows one fixed line and sends nothing; the switch follows
 * the saved profile, so it stays off.
 */
export function LeaderboardSetting({ optedIn, hasName, save }: LeaderboardSettingProps) {
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turn = async (next: boolean) => {
    if (next && !hasName) {
      setLine(copy.profile.nameRequired);
      return;
    }
    setLine(null);
    setBusy(true);
    try {
      await save({ leaderboard_opt_in: next });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Setting label={copy.profile.leaderboardSwitch}>
      <Switch
        testID="leaderboard-switch"
        accessibilityRole="switch"
        accessibilityLabel={copy.profile.leaderboardSwitch}
        value={optedIn}
        disabled={busy}
        onValueChange={(next) => void turn(next)}
        trackColor={{ false: colors.neutral[300], true: colors.lime }}
        thumbColor={colors.paper}
        ios_backgroundColor={colors.neutral[300]}
        style={styles.switch}
      />
      <Text style={styles.note}>{copy.profile.leaderboardNote}</Text>
      {line === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.line}>{line}</Text>
        </View>
      )}
    </Setting>
  );
}

const styles = StyleSheet.create({
  switch: { alignSelf: 'flex-start' },
  note: { ...type.body, color: colors.neutral[700] },
  line: { ...type.body, color: colors.ink, marginTop: space[2] },
});
