import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { OutlineButton } from '../components/OutlineButton';
import { copy } from '../copy';
import { colors, type } from '../theme';
import { ProfileField } from './ProfileField';
import { useDeleteAccount } from './useDeleteAccount';

type DeleteAccountSheetProps = {
  /** Called on Cancel, a tap above the sheet, or the Android back button. */
  onClose: () => void;
};

/** True when `typed` is the confirmation word, ignoring case and surrounding spaces. */
function isConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === copy.profile.deleteWord;
}

/**
 * The confirmation of Delete account (src/profile/useDeleteAccount.ts), on the shared
 * `BottomSheet`: the title, what deleting does, a field where the person types the word
 * `delete`, the Delete account button (enabled only once the word is typed, and while no deletion
 * runs) and Cancel. A failed deletion shows one fixed line. Rendered only while open, so each
 * opening starts with an empty field.
 */
export function DeleteAccountSheet({ onClose }: DeleteAccountSheetProps) {
  const [typed, setTyped] = useState('');
  const { deleteAccount, status } = useDeleteAccount();
  const ready = isConfirmed(typed) && status !== 'loading';

  return (
    <BottomSheet
      title={copy.profile.deleteTitle}
      cancelLabel={copy.profile.cancel}
      onClose={onClose}
      testID="delete-account-sheet"
    >
      <Text style={styles.text}>{copy.profile.deleteBody}</Text>
      <ProfileField
        label={copy.profile.deleteField}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
      />
      {status === 'error' ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.text}>{copy.profile.deleteFailed}</Text>
        </View>
      ) : null}
      <OutlineButton label={copy.profile.deleteAccount} onPress={deleteAccount} disabled={!ready} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  text: { ...type.body, color: colors.ink },
});
