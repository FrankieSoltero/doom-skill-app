import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, colors, type } from '../theme';

// Values from docs/design/card-feed/README.md:167 ("42px tall, 1.5px borders, selected option
// filled yellow"), which the theme lacks.
const OPTION_HEIGHT = 42;

/**
 * The budgets offered, in minutes a day, within the API's 5 to 60. README.md:167 shows four
 * (5, 10, 15, 20); the longer ones are for a learner with more time.
 */
const OPTIONS = [5, 10, 15, 20, 30, 45, 60];

type MinutesPickerProps = {
  /** The profile's daily minutes; no option is selected when it is not one of them. */
  value: number;
  onChange: (minutes: number) => void;
};

/**
 * The daily time budget (README.md:167): a row of options, each 42 points tall in a 1.5-point ink
 * border, the selected one filled yellow. A screen reader hears each as a radio button.
 */
export function MinutesPicker({ value, onChange }: MinutesPickerProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((minutes, position) => {
        const selected = minutes === value;
        return (
          <Pressable
            key={minutes}
            accessibilityRole="radio"
            accessibilityLabel={copy.profile.minutesLabel(minutes)}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(minutes);
            }}
            style={[
              styles.option,
              position === 0 ? null : styles.joined,
              selected ? styles.selected : null,
            ]}
          >
            <Text style={styles.text}>{copy.profile.minutes(minutes)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  option: {
    flex: 1,
    height: OPTION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  joined: { borderLeftWidth: 0 },
  selected: { backgroundColor: colors.yellow },
  text: { ...type.caption, color: colors.ink },
});
