/**
 * One row of the Explore list (app/(tabs)/explore.tsx), and of a subject's branches sheet
 * (src/topics/BranchesSheet.tsx, which the tab hands this row): its label, with a catalog row's
 * kind and parent under it (curriculum catalog plan, C1: "subject · Physics"; an area its kind
 * alone; an open topic nothing); its group chip (a catalog row's); and Open or Build; or, for a
 * row with branches in the list (`onBranches`), their count and a chevron, its tap opening them.
 * A screen reader hears the row as before (`copy.explore.row`): label, group and action.
 */
import { ChevronRight } from 'lucide-react-native';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, colors, space, type } from '../theme';
import type { ExploreRow } from './useExploreResults';

/** The size and stroke of a row's chevron, as the search field's icon. */
const CHEVRON_SIZE = 18;
const CHEVRON_STROKE = 1.5;

type ResultRowProps = {
  row: ExploreRow;
  /** The row's own action: open it if built, else build it. */
  onAct: (row: ExploreRow) => void;
  /** Given, a row with branches shows their count and a chevron, and its tap calls this. */
  onBranches?: (row: ExploreRow) => void;
};

/**
 * The line under a row's label: a catalog row's kind and parent. Only a catalog row has a place
 * in the curriculum: an open topic has none.
 */
function kindLine(row: ExploreRow): string | null {
  if (row.source !== 'catalog' || row.kind === null) return null;
  return copy.explore.kindLine(row.kind, row.parent);
}

/** One result (module comment). */
export function ResultRow({ row, onAct, onBranches }: ResultRowProps) {
  const slug = row.builtSlug;
  const branching = onBranches !== undefined && row.branches > 0;
  const action = slug === null ? copy.explore.build : copy.explore.open;
  const count = copy.explore.branches(row.branches);
  // An open topic carries no group of its own (useExploreResults): it shows no chip.
  const group = row.source === 'topic' ? null : copy.explore.group[row.group];
  const kind = kindLine(row);
  return (
    <Pressable
      testID="explore-row"
      accessibilityRole="button"
      accessibilityLabel={copy.explore.row(row.label, branching ? count : action, group)}
      onPress={() => {
        if (branching) {
          // The search field keeps its keyboard over the sheet's modal: put it away first.
          Keyboard.dismiss();
          onBranches(row);
        } else onAct(row);
      }}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{row.label}</Text>
        {kind === null ? null : <Text style={styles.muted}>{kind}</Text>}
      </View>
      {group === null ? null : <Text style={styles.chip}>{group}</Text>}
      {branching ? (
        <>
          <Text style={styles.muted}>{count}</Text>
          <ChevronRight
            testID="explore-row-chevron"
            size={CHEVRON_SIZE}
            strokeWidth={CHEVRON_STROKE}
            color={colors.ink}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </>
      ) : (
        <Text style={slug === null ? styles.chip : styles.open}>{action}</Text>
      )}
    </Pressable>
  );
}

/** A row's group chip and its action: caption text in a hairline ink box. */
const CHIP = {
  ...type.caption,
  color: colors.ink,
  borderColor: colors.ink,
  borderWidth: border.hairline,
  paddingHorizontal: space[2],
  paddingVertical: space[1],
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  text: { flex: 1 },
  label: { ...type.button, color: colors.ink },
  chip: CHIP,
  open: { ...CHIP, backgroundColor: colors.lime },
  /** The kind line and the branch count: muted caption text. */
  muted: { ...type.caption, color: colors.neutral[700] },
});
