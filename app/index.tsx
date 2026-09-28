import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../src/copy';
import { colors } from '../src/theme';

export default function HomeScreen() {
  return (
    <View testID="home-screen" style={styles.root}>
      <Text style={styles.title}>{copy.appName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  title: {
    color: colors.ink,
  },
});
