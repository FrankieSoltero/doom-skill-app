/**
 * A catalog subject's branches (catalog learnable-topics plan, L6; the spec's L6 mock): the sheet
 * the Explore tab opens when a row with branches is tapped. Under the subject's title, "Learn all
 * of …" picks the subject itself; under the Branches heading, each branch from
 * `useBranches` (the subject's `branchesKey`, else its `key`) is drawn by the caller's `Row` (the Explore list's own row) and picks
 * itself on its tap. The caller does a picked row's own action (open it if built, else build it)
 * and closes the sheet.
 *
 * - While the branches load, one line says so; a failed read says it could not load them. Learn
 *   all stays usable either way.
 * - A subject whose branches came back empty shows no line: Learn all is still its action.
 * - The branches scroll inside the sheet past half the screen's height; a tap on one acts even
 *   while a keyboard is up.
 */
import type { ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import { colors, type } from '../theme';
import { useBranches } from './useBranches';
import type { ExploreRow } from './useExploreResults';

type BranchesSheetProps = {
  /** The row whose branches the sheet lists. */
  subject: ExploreRow;
  /** Draws one branch; its tap calls `onAct` with that branch. */
  Row: ComponentType<{ row: ExploreRow; onAct: (row: ExploreRow) => void }>;
  /** Called with the subject (Learn all) or a branch (its tap). */
  onPick: (row: ExploreRow) => void;
  /** Called on Close, a tap above the sheet, or the Android back button. */
  onClose: () => void;
};

/** The line under the heading while the branches are not there: none once they are. */
function statusLine(status: ReturnType<typeof useBranches>['status']): string | null {
  if (status === 'loading') return copy.explore.branchesLoading;
  if (status === 'error') return copy.explore.branchesFailed;
  return null;
}

/** The branches sheet (module comment). */
export function BranchesSheet({ subject, Row, onPick, onClose }: BranchesSheetProps) {
  const branches = useBranches(subject.branchesKey ?? subject.key);
  const { height } = useWindowDimensions();
  const line = statusLine(branches.status);
  return (
    <BottomSheet
      testID="explore-branches-sheet"
      title={subject.label}
      cancelLabel={copy.explore.branchesClose}
      onClose={onClose}
    >
      <PrimaryButton
        label={copy.explore.learnAll(subject.label)}
        onPress={() => {
          onPick(subject);
        }}
      />
      <Text accessibilityRole="header" style={styles.heading}>
        {copy.explore.branchesHeading}
      </Text>
      {line === null ? null : <Text style={styles.line}>{line}</Text>}
      <ScrollView style={{ maxHeight: height / 2 }} keyboardShouldPersistTaps="handled">
        {branches.rows.map((row) => (
          <Row key={row.key} row={row} onAct={onPick} />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.caption, color: colors.neutral[700], textTransform: 'uppercase' },
  line: { ...type.body, color: colors.neutral[700] },
});
