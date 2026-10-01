import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { border, colors, fonts, hardShadow, space, type } from '../theme';

// Search field values from docs/design/card-feed/README.md:162, which the theme lacks.
/** The field's height, README.md:162. */
const FIELD_HEIGHT = 48;
/** Icon size and stroke, README.md:22. */
const ICON_SIZE = 18;
const ICON_STROKE = 1.5;

type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** The hint shown while the field is empty, from `copy`. */
  placeholder: string;
  /** The field's spoken label, from `copy`. */
  label: string;
  /** The most characters the field takes. */
  maxLength: number;
};

/**
 * The Explore tab's search input (README.md:162): 48 points tall, a 1.5-point ink border, a
 * 3-point hard shadow, and a `Search` icon before the text.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
}: SearchFieldProps) {
  return (
    <View style={styles.frame}>
      <View style={styles.shadow} />
      <View style={styles.body}>
        <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.neutral[600]}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { marginRight: hardShadow.option, marginBottom: hardShadow.option },
  shadow: {
    position: 'absolute',
    top: hardShadow.option,
    left: hardShadow.option,
    right: -hardShadow.option,
    bottom: -hardShadow.option,
    backgroundColor: colors.ink,
  },
  body: {
    height: FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    borderWidth: border.strong,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.body,
    fontSize: type.body.fontSize,
    color: colors.ink,
  },
});
