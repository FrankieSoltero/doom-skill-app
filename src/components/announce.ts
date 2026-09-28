import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Reads `message` to a screen reader that would not notice it appear. iOS has no live regions and
 * VoiceOver does not read a view just because it appeared, so iOS gets an announcement. Android is
 * left to the polite live region the caller puts the message in, so TalkBack does not read it
 * twice.
 */
export function announce(message: string): void {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibility(message);
  }
}
