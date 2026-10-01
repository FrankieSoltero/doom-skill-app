import { Check, Lock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { components } from '../api/schema';
import { copy } from '../copy';
import { border, colors, hardShadow, space, type } from '../theme';
import { MasteryBar, wholePercent } from './MasteryBar';
import { milestoneColor } from './milestoneColor';

type Milestone = Pick<components['schemas']['Milestone'], 'position' | 'title'>;
type TreeNode = components['schemas']['TreeNode'];

// Values from docs/design/card-feed/README.md:158-160 and the prototype, which the theme lacks.
/** The number square, README.md:158. */
const NUMBER_SIZE = 26;
/** The icon column and the icons, README.md:159 and :22. */
const ICON_SIZE = 16;
const ICON_STROKE = 1.5;
/** A locked milestone's opacity, README.md:160. */
const LOCKED_OPACITY = 0.6;
/** Inner padding of the section, as a card's (CardFrame). */
const SECTION_PADDING = 14;
/**
 * The mastery at which a node counts as mastered and shows a check: the API's `UNLOCK_MASTERY`
 * (services/api/app/services/tree.py), the mastery a prerequisite needs to unlock what follows it.
 */
const MASTERED = 0.6;

/** One node: its name, its mastery bar, then a lock, a check, or nothing. */
function NodeRow({ node, color }: { node: TreeNode; color: string }) {
  const locked = !node.unlocked;
  const percent = wholePercent(node.mastery);
  let icon = <View style={styles.icon} />;
  if (locked) {
    icon = (
      <View testID="node-locked" style={styles.icon}>
        <Lock size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.neutral[600]} />
      </View>
    );
  } else if (node.mastery >= MASTERED) {
    icon = (
      <View testID="node-mastered" style={styles.icon}>
        <Check size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink} />
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={copy.tree.node(node.title, percent, locked)}
    >
      <Text style={[styles.name, locked ? styles.lockedText : null]}>{node.title}</Text>
      <MasteryBar value={node.mastery} locked={locked} color={color} />
      {icon}
    </View>
  );
}

type MilestoneSectionProps = {
  milestone: Milestone;
  /** The milestone's nodes, in the tree's order. */
  nodes: TreeNode[];
};

/**
 * One milestone of the skill tree (README.md:158-160): a framed section with a hard shadow; its
 * header has the milestone's number in a square of its color, its title, and "Locked" when every
 * node is locked, which also dims the section and drops its shadow. Then one row per node.
 */
export function MilestoneSection({ milestone, nodes }: MilestoneSectionProps) {
  const color = milestoneColor(milestone.position);
  const locked = nodes.length > 0 && nodes.every((node) => !node.unlocked);

  return (
    <View testID="milestone-section" style={[styles.frame, locked ? styles.dimmed : null]}>
      {locked ? null : <View testID="milestone-shadow" style={styles.shadow} />}
      <View style={styles.body}>
        <View style={styles.header}>
          <View testID="milestone-number" style={[styles.number, { backgroundColor: color }]}>
            <Text style={styles.numberText}>{String(milestone.position)}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {milestone.title}
          </Text>
          {locked ? <Text style={styles.status}>{copy.tree.locked}</Text> : null}
        </View>
        {nodes.map((node) => (
          <NodeRow key={node.id} node={node} color={color} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { marginRight: hardShadow.card, marginBottom: hardShadow.card },
  dimmed: { opacity: LOCKED_OPACITY },
  shadow: {
    position: 'absolute',
    top: hardShadow.card,
    left: hardShadow.card,
    right: -hardShadow.card,
    bottom: -hardShadow.card,
    backgroundColor: colors.ink,
  },
  body: {
    backgroundColor: colors.paper,
    borderWidth: border.strong,
    borderColor: colors.ink,
    padding: SECTION_PADDING,
    gap: space[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: space[2] },
  number: {
    width: NUMBER_SIZE,
    height: NUMBER_SIZE,
    borderWidth: border.strong,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...type.button, color: colors.ink },
  title: { ...type.button, color: colors.ink, flex: 1 },
  status: { ...type.caption, color: colors.neutral[700] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[2],
    borderTopWidth: border.hairline,
    borderTopColor: colors.divider,
  },
  name: { ...type.small, color: colors.ink, flex: 1 },
  lockedText: { color: colors.neutral[600] },
  icon: { width: ICON_SIZE, alignItems: 'center' },
});
