/**
 * The sheet of a card's sources (M6 hardening Task 12), opened by the Sources action in the card
 * frame's corner (src/cards/SourcesButton.tsx): one row per source with its title, its licence
 * line and the host of its URL, on the shared `BottomSheet`. A tap on a row opens the URL in the
 * system browser with `Linking.openURL`, and only when it starts with `https://`: the card schema
 * already refuses any other URL (src/data/schema.ts), and this checks again, so nothing else (an
 * `http`, `javascript:` or app URL) is ever handed to the system. A URL the system could not open
 * is logged by the event alone, never the URL. The sheet stays open after a tap.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import type { SourceLink } from '../data';
import { logWarning } from '../log';
import { border, colors, space, type } from '../theme';
import { BottomSheet } from './BottomSheet';

const HTTPS = 'https://';
/**
 * The host of an `https` URL: the text after `https://` up to the first `/`, `\`, `?` or `#`,
 * without a `user:password@` part. A `\` ends the host as it does in a browser, so
 * `https://a.test\@b.test/` shows `a.test`, the host the browser opens.
 */
const HOST = /^https:\/\/(?:[^/\\?#@]*@)?([^/\\?#@]+)/;

/** The host of `url` in lower case, as the row shows it; `''` for a URL that is not `https`. */
export function hostOf(url: string): string {
  return HOST.exec(url)?.[1]?.toLowerCase() ?? '';
}

/** Opens `url` in the system browser when it is `https` (module comment). */
function openSource(url: string): void {
  if (!url.startsWith(HTTPS)) return;
  Linking.openURL(url).catch(() => {
    logWarning('source_open_failed');
  });
}

type SourcesSheetProps = {
  /** Shown while true. */
  visible: boolean;
  /** The card's sources, in the order the API sent them. */
  sources: readonly SourceLink[];
  /** Called on Close, a tap above the sheet, or the Android back button. */
  onClose: () => void;
};

/** The sheet: the title, a row per source and Close (module comment). */
export function SourcesSheet({ visible, sources, onClose }: SourcesSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      title={copy.sources.action}
      cancelLabel={copy.sources.close}
      onClose={onClose}
      testID="sources-sheet"
    >
      {sources.map((source, index) => (
        <Pressable
          // Two sources may share a URL; the index keeps each row's key apart.
          key={`${String(index)}:${source.url}`}
          accessibilityRole="link"
          onPress={() => {
            openSource(source.url);
          }}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <Text style={styles.title} numberOfLines={2}>
            {source.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.detail} numberOfLines={1}>
              {copy.sources.licence(source.license)}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {hostOf(source.url)}
            </Text>
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // At least 44 points tall: the minimum touch target.
  row: {
    minHeight: 44,
    paddingVertical: space[2],
    borderBottomWidth: border.hairline,
    borderColor: colors.ink,
    gap: space[1],
  },
  pressed: { opacity: 0.6 },
  title: { ...type.body, color: colors.ink },
  meta: { gap: space[1] },
  detail: { ...type.caption, color: colors.ink },
});
