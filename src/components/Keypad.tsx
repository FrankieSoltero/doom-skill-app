import * as Haptics from 'expo-haptics';
import { ArrowLeft, ArrowRight, Delete } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';

import { copy } from '../copy';
import type { Keypad as KeypadSpec, KeySpec } from '../data/keypadSchema';
import type { KeyPress } from '../feed/keypad';
import { colors, fonts, hardShadow } from '../theme';

// The code keypad's values (M9 plan K, P4, P11 and P17; spec 3.2), from the "DoomSkill Keypad"
// mock-up.
/** Height of a group key (P11). */
const KEY_HEIGHT = 44;
/** Height of a control key: the caret keys, delete, ABC and the action key (P11). */
const CONTROL_HEIGHT = 52;
/** Gap between keys and between lines. */
const GAP = 8;
/** A key's border. */
const BORDER = 1;
/** Size of a code key's label, in the code font. */
const CODE_SIZE = 13;
/** Size of a word key's label (ABC, the action key), in the heading font. */
const WORD_SIZE = 16;
/** Size of the caret and delete icons. */
const ICON_SIZE = 20;
/** Stroke width of the caret and delete icons. */
const ICON_STROKE = 1.5;

type GroupName = KeypadSpec['groups'][number]['name'];

/** Each group's colour: its keys' shadow, and their face while pressed (P4). */
const GROUP_COLOURS: Record<GroupName, string> = {
  calls: colors.lime,
  notation: colors.pink,
  methods: colors.aqua,
  digits: colors.yellow,
};

/** A key's colours: its face, its face while pressed, and its shadow. */
type Look = { face: string; pressedFace: string; shadow: string };

const groupLook = (hue: string): Look => ({ face: colors.paper, pressedFace: hue, shadow: hue });
/** The caret, delete and ABC keys belong to no group: paper, on a paper shadow. */
const CONTROL_LOOK: Look = { face: colors.paper, pressedFace: colors.paper, shadow: colors.paper };
/** The control row's caret and delete keys, in order (P11): their press, icon and spoken label. */
const EDIT_KEYS: { value: Exclude<KeyPress, KeySpec>; Icon: LucideIcon; label: string }[] = [
  { value: 'left', Icon: ArrowLeft, label: copy.keypadLeft },
  { value: 'right', Icon: ArrowRight, label: copy.keypadRight },
  { value: 'delete', Icon: Delete, label: copy.keypadDelete },
];
/** The action key: lime on a paper shadow (P4). */
const ACTION_LOOK: Look = { face: colors.lime, pressedFace: colors.lime, shadow: colors.paper };

type KeypadProps = {
  /** The keypad the card's editor serves: its groups, in order, and its action. */
  keys: KeypadSpec;
  /** Called with a group key's spec, or with `delete`, `left` or `right`. */
  onPress: (press: KeyPress) => void;
  /** Called on ABC: the editor hands over to the system keyboard. */
  onAbc: () => void;
  /** Called on the action key: run on an exercise, submit on a checkpoint. */
  onAction: () => void;
};

/**
 * The code keypad (M9 plan K, spec 3.2): one row per group of `keys`, in the order served, its 1
 * to 6 keys stretched to the width (P17), and below them the control row: ←, →, ⌫, ABC and the
 * action key over two columns. Four rows and the control row fit the sheet, so nothing scrolls.
 * A key press passes through `onPress` with a haptic tick; ABC and the action key call their own
 * callbacks. It draws `keys` only: the store is the sheet's (KeypadSheet.tsx).
 */
export function Keypad({ keys, onPress, onAbc, onAction }: KeypadProps) {
  const press = (keyPress: KeyPress) => {
    onPress(keyPress);
    // The tick is decoration: a device without haptics rejects, and the press has happened.
    Haptics.selectionAsync().catch(() => undefined);
  };
  return (
    <View style={styles.keypad}>
      {/* The rows take the space above the control row, which stays at the sheet's bottom. */}
      <View style={styles.groups}>
        {keys.groups.map(({ name, keys: specs }) => (
          <GroupRow key={name} name={name} specs={specs} onPress={press} />
        ))}
      </View>
      <View testID="keypad-controls" style={styles.line}>
        {EDIT_KEYS.map(({ value, Icon, label }) => (
          <IconKey
            key={value}
            Icon={Icon}
            label={label}
            onPress={() => {
              press(value);
            }}
          />
        ))}
        <Key label={copy.keypadAbc} look={CONTROL_LOOK} size={styles.control} onPress={onAbc}>
          <Text style={styles.word}>{copy.keypadAbc}</Text>
        </Key>
        <ActionKey action={keys.action} onPress={onAction} />
      </View>
    </View>
  );
}

/** A group's keys in one row, named for a screen reader by the group (P17). */
function GroupRow({
  name,
  specs,
  onPress,
}: {
  name: GroupName;
  specs: KeySpec[];
  onPress: (press: KeyPress) => void;
}) {
  const look = groupLook(GROUP_COLOURS[name]);
  return (
    <View
      testID={`keypad-group-${name}`}
      accessibilityLabel={copy.keypadGroup[name]}
      style={styles.line}
    >
      {specs.map((spec) => (
        <Key
          key={spec.label}
          label={spec.label}
          look={look}
          size={styles.groupKey}
          onPress={() => {
            onPress(spec);
          }}
        >
          <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
            {spec.label}
          </Text>
        </Key>
      ))}
    </View>
  );
}

/** A caret or delete key: an icon, named by `label`. */
function IconKey({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Key label={label} look={CONTROL_LOOK} size={styles.control} onPress={onPress}>
      <Icon
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
        color={colors.ink}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Key>
  );
}

/** The action key: ▶ Run on an exercise, Submit on a checkpoint (P4). */
function ActionKey({ action, onPress }: { action: KeypadSpec['action']; onPress: () => void }) {
  const label = action === 'run' ? copy.keypadRun : copy.keypadSubmit;
  return (
    <Key label={label} look={ACTION_LOOK} size={styles.action} onPress={onPress}>
      <Text style={styles.word}>{label}</Text>
    </Key>
  );
}

type KeyProps = {
  /** The spoken label, and the key's test id. */
  label: string;
  look: Look;
  /** The key's height and its share of the line. */
  size: ViewStyle;
  onPress: () => void;
  /** What the face shows. */
  children: ReactNode;
};

/**
 * One square key: a face with a 1 point ink border over a 3 point hard shadow, drawn as a sibling
 * view behind it. Pressed, it drops onto its shadow and its face takes the pressed colour.
 */
function Key({ label, look, size, onPress, children }: KeyProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`keypad-key-${label}`}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [size, pressed ? styles.pressed : null]}
    >
      {({ pressed }: PressableStateCallbackType) => (
        <>
          {pressed ? null : (
            <View
              testID="keypad-key-shadow"
              style={[styles.shadow, { backgroundColor: look.shadow }]}
            />
          )}
          <View
            testID="keypad-key-face"
            style={[styles.face, { backgroundColor: pressed ? look.pressedFace : look.face }]}
          >
            {children}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keypad: { flex: 1, gap: GAP },
  groups: { flex: 1, gap: GAP },
  line: { flexDirection: 'row', gap: GAP },
  groupKey: { flex: 1, height: KEY_HEIGHT },
  control: { flex: 1, height: CONTROL_HEIGHT },
  action: { flex: 2, height: CONTROL_HEIGHT },
  pressed: {
    transform: [{ translateX: hardShadow.option }, { translateY: hardShadow.option }],
  },
  shadow: {
    position: 'absolute',
    top: hardShadow.option,
    left: hardShadow.option,
    right: -hardShadow.option,
    bottom: -hardShadow.option,
  },
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER,
    borderColor: colors.ink,
  },
  code: { fontFamily: fonts.mono, fontSize: CODE_SIZE, color: colors.ink },
  word: { fontFamily: fonts.heading, fontSize: WORD_SIZE, color: colors.ink },
});
