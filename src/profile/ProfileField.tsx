import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { BUTTON_HEIGHT } from '../components/PrimaryButton';
import { border, colors, fonts, space, type } from '../theme';

/** One setting of the Profile tab: its caption in the kicker style, then its control. */
export function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      {children}
    </View>
  );
}

type ProfileFieldProps = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  /** The caption over the field, also its spoken label. */
  label: string;
};

/**
 * A Profile text field (README.md:168, "Reminder time"): its caption, then the text in a
 * 1.5-point ink border as tall as a button.
 */
export function ProfileField({ label, ...input }: ProfileFieldProps) {
  return (
    <Setting label={label}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.neutral[600]}
        style={styles.input}
        {...input}
      />
    </Setting>
  );
}

const styles = StyleSheet.create({
  setting: { gap: space[2] },
  label: { ...type.kicker, color: colors.neutral[700] },
  input: {
    fontFamily: fonts.body,
    fontSize: type.body.fontSize,
    color: colors.ink,
    borderWidth: border.strong,
    borderColor: colors.ink,
    minHeight: BUTTON_HEIGHT,
    paddingHorizontal: space[4],
  },
});
