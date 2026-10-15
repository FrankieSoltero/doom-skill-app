import { StyleSheet, View } from 'react-native';

import { ErrorScreen } from '../components/ErrorScreen';
import { copy } from '../copy';

type ConnectCardProps = {
  /** Asks the server again: what the session's `retry` does. */
  onRetry: () => void;
};

/**
 * The feed's end card offline (offline-topic plan O2): the server cannot be reached and every set
 * kept on the phone is answered. It says to connect, with Retry; it is not an error.
 */
export function ConnectCard({ onRetry }: ConnectCardProps) {
  return (
    <View testID="connect-card" style={styles.root}>
      <ErrorScreen message={copy.connectForMore} actionLabel={copy.retry} onAction={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
