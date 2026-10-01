/**
 * The Profile tab's link to the app's source (M7 open client, `apps/mobile/README.md`'s Licence
 * section): the build tag of the running build (`app-v<version>+<sha>`) when it has one, else
 * "development build". A tap opens that tag's tree on GitHub, or the repository's root with no
 * tag, through `Linking.openURL`, and only when the URL is `https` — the same rule
 * `src/components/SourcesSheet.tsx` applies to a card's sources, applied again here since
 * `sourceUrl` always returns an `https` URL in practice but nothing else should ever reach
 * `Linking.openURL` unchecked.
 */
import { Linking, Pressable, StyleSheet, Text } from 'react-native';

import { buildTag, sourceUrl } from '../config';
import { copy } from '../copy';
import { logWarning } from '../log';
import { colors, type } from '../theme';
import { Setting } from './ProfileField';

const HTTPS = 'https://';

/** Whether `url` may be opened: `https` only, with no leading or trailing whitespace. */
export function isHttpsUrl(url: string): boolean {
  return url.startsWith(HTTPS);
}

/** Opens `url` in the system browser when it is `https` (module comment). */
function openSource(url: string): void {
  if (!isHttpsUrl(url)) return;
  Linking.openURL(url).catch(() => {
    logWarning('source_link_open_failed');
  });
}

/** The Profile row that links to the app's source (module comment). */
export function SourceLink() {
  const tag = buildTag();
  const subtitle = tag ?? copy.profile.developmentBuild;

  return (
    <Setting label={copy.profile.sourceCode}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={copy.profile.sourceCode}
        onPress={() => {
          openSource(sourceUrl(tag));
        }}
      >
        <Text style={styles.text}>{subtitle}</Text>
      </Pressable>
    </Setting>
  );
}

const styles = StyleSheet.create({
  text: { ...type.body, color: colors.ink },
});
