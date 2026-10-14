import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorScreen } from '../../src/components/ErrorScreen';
import { LoadingState } from '../../src/components/LoadingState';
import { wholePercent } from '../../src/components/MasteryBar';
import { MilestoneSection } from '../../src/components/MilestoneSection';
import { milestoneColor } from '../../src/components/milestoneColor';
import { TabScreen } from '../../src/components/TabScreen';
import { copy } from '../../src/copy';
import { useActiveTopic } from '../../src/feed/useActiveTopic';
import { useTree, type Tree } from '../../src/topics/useTree';
import { border, colors, space, type } from '../../src/theme';

// Values from docs/design/card-feed/README.md:157, which the theme lacks.
/** The overall bar's height. */
const OVERALL_HEIGHT = 10;
/** A section's bar: as tall as a node's mastery bar (README.md:159). */
const SECTION_HEIGHT = 6;

/** A section's points: what the learner earned in it, and its target. */
type Points = { earned: number; target: number };

type Section = {
  key: string;
  milestone: { position: number; title: string };
  /** `null` for "Other skills", which belongs to no milestone. */
  points: Points | null;
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
    points: { earned: milestone.earned, target: milestone.target },
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
      points: null,
      nodes: others,
    });
  }
  return sections;
}

/**
 * Earned over target points as a bar filled in `color` to `earned / target` and the line
 * "12 / 100 points", read to a screen reader as a progress bar labelled by the line. A section
 * at its target reads as complete; a target of 0 (none computed yet) draws an empty bar, at 0,
 * whatever was earned.
 */
function PointsBar({ points, color, height }: { points: Points; color: string; height: number }) {
  const percent = points.target > 0 ? wholePercent(points.earned / points.target) : 0;
  const line = copy.tree.sectionPoints(points.earned, points.target);
  return (
    <View
      style={styles.points}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={line}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.bar, { height }]}>
        <View testID="points-fill" style={{ flex: percent, backgroundColor: color }} />
        <View testID="points-rest" style={{ flex: 100 - percent }} />
      </View>
      <Text style={styles.line}>{line}</Text>
    </View>
  );
}

/** The topic's points (README.md:157): the sum of its sections' earned over their targets. */
function topicPoints(tree: Tree): Points {
  return tree.milestones.reduce(
    (sum, milestone) => ({
      earned: sum.earned + milestone.earned,
      target: sum.target + milestone.target,
    }),
    { earned: 0, target: 0 },
  );
}

/** One section: its points over its milestone's frame; "Other skills" has no points. */
function TreeSection({ section }: { section: Section }) {
  const { milestone, points, nodes } = section;
  return (
    <View style={styles.section}>
      {points === null ? null : (
        <PointsBar
          points={points}
          color={milestoneColor(milestone.position)}
          height={SECTION_HEIGHT}
        />
      )}
      <MilestoneSection milestone={milestone} nodes={nodes} />
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
      <PointsBar points={topicPoints(tree)} color={colors.lime} height={OVERALL_HEIGHT} />
      {sectionsOf(tree).map((section) => (
        <TreeSection key={section.key} section={section} />
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
 * state, the topic's points bar and one section per milestone, each with its points bar and each
 * node with its mastery bar and its locked state. With no active topic it offers Explore; a tree not built yet or a failed
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
  points: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  bar: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  line: { ...type.button, color: colors.ink },
  section: { gap: space[2] },
});
