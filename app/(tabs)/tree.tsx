import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorScreen } from '../../src/components/ErrorScreen';
import { LoadingState } from '../../src/components/LoadingState';
import { wholePercent } from '../../src/components/MasteryBar';
import { MilestoneSection } from '../../src/components/MilestoneSection';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { useActiveTopic } from '../../src/feed/useActiveTopic';
import { useTree, type Tree } from '../../src/topics/useTree';
import { border, colors, space, type } from '../../src/theme';

/** The overall bar's height, docs/design/card-feed/README.md:157. */
const OVERALL_HEIGHT = 10;

type Section = {
  key: string;
  milestone: { position: number; title: string };
  nodes: Tree['nodes'];
};

/**
 * The tree's sections: one per milestone, by position, with its nodes in the tree's order; then
 * the nodes of no known milestone under "Other skills", when there are any.
 */
function sectionsOf(tree: Tree): Section[] {
  const milestones = [...tree.milestones].sort((a, b) => a.position - b.position);
  const known = new Set(milestones.map((milestone) => milestone.id));
  const sections: Section[] = milestones.map((milestone) => ({
    key: milestone.id,
    milestone,
    nodes: tree.nodes.filter((node) => node.milestone_id === milestone.id),
  }));
  const others = tree.nodes.filter(
    (node) => node.milestone_id === null || !known.has(node.milestone_id),
  );
  if (others.length > 0) {
    const position = milestones.length + 1;
    sections.push({
      key: 'other',
      milestone: { position, title: copy.tree.otherSkills },
      nodes: others,
    });
  }
  return sections;
}

/** The topic's progress (README.md:157): the mean mastery of its nodes, as a lime bar and a percent. */
function OverallBar({ tree }: { tree: Tree }) {
  const total = tree.nodes.reduce((sum, node) => sum + node.mastery, 0);
  const percent = wholePercent(total / tree.nodes.length);
  return (
    <View
      style={styles.overall}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={copy.tree.overall}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={styles.overallBar}>
        <View style={{ flex: percent, backgroundColor: colors.lime }} />
        <View style={{ flex: 100 - percent }} />
      </View>
      <Text style={styles.percent}>{copy.percent(percent)}</Text>
    </View>
  );
}

/** The loaded tree: its end state, its progress, then its milestones. */
function TreeContent({ tree }: { tree: Tree }) {
  if (tree.nodes.length === 0) return <ErrorScreen message={copy.tree.empty} />;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {tree.topic.end_state === null ? null : (
        <Text style={styles.endState}>{tree.topic.end_state}</Text>
      )}
      <OverallBar tree={tree} />
      {sectionsOf(tree).map((section) => (
        <MilestoneSection key={section.key} milestone={section.milestone} nodes={section.nodes} />
      ))}
    </ScrollView>
  );
}

/** The screen's body for the active topic and its tree. */
function TreeBody({
  slug,
  loaded,
  state,
}: {
  slug: string | null;
  loaded: boolean;
  state: ReturnType<typeof useTree>;
}) {
  if (!loaded || state.status === 'loading') return <LoadingState label={copy.loading} />;
  if (slug === null) {
    return (
      <ErrorScreen
        message={copy.tree.noTopic}
        actionLabel={copy.exploreTopics}
        onAction={() => {
          router.navigate('/explore');
        }}
      />
    );
  }
  if (state.tree !== undefined) return <TreeContent tree={state.tree} />;
  const message = state.error?.kind === 'conflict' ? copy.tree.notReady : copy.tree.loadFailed;
  return <ErrorScreen message={message} actionLabel={copy.retry} onAction={state.retry} />;
}

/**
 * The Tree tab (README.md:156-160), read-only: the active topic's skill tree
 * (`GET /topics/{slug}/tree`), with the kicker "SKILL TREE" over the topic's title, its end
 * state, an overall progress bar and one section per milestone, each node with its mastery bar
 * and its locked state. With no active topic it offers Explore; a tree not built yet or a failed
 * load shows a fixed line with Retry.
 */
export default function TreeScreen() {
  const { slug, loaded } = useActiveTopic();
  const state = useTree(loaded ? slug : null);
  const topic = state.tree?.topic;

  return (
    <TabScreen
      testID="tree-screen"
      title={topic?.title ?? copy.tree.title}
      {...(topic === undefined ? {} : { kicker: copy.tree.kicker })}
    >
      <TreeBody slug={slug} loaded={loaded} state={state} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[6], paddingBottom: space[8] },
  endState: { ...type.small, color: colors.ink },
  overall: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  overallBar: {
    flex: 1,
    height: OVERALL_HEIGHT,
    flexDirection: 'row',
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  percent: { ...type.button, color: colors.ink },
});
