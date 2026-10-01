import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorScreen } from '../../../src/components/ErrorScreen';
import { LoadingState } from '../../../src/components/LoadingState';
import { OutlineButton } from '../../../src/components/OutlineButton';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { copy } from '../../../src/copy';
import { placementCopy } from '../../../src/copy/placement';
import { placement, type Placement } from '../../../src/data';
import { PlacementCard } from '../../../src/placement/PlacementCard';
import { usePlacement, type PlacementStep } from '../../../src/placement/usePlacement';
import { colors, space, type } from '../../../src/theme';

// The tab screens' side padding (src/components/TabScreen.tsx), as the topic screen uses it.
const PADDING_X = 18;

/**
 * Opens the Today feed: closes this screen back to the tabs (`dismissTo`), as the topic screen's
 * Start does, so no second copy of the tabs is pushed.
 */
function openFeed(): void {
  router.dismissTo('/');
}

type Flow = ReturnType<typeof usePlacement>;

/** The intro: what the quiz is, how many questions, Start and Skip. */
function Intro({ total, flow }: { total: number; flow: Flow }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        {placementCopy.title}
      </Text>
      <Text style={styles.body}>{placementCopy.intro(total)}</Text>
      <PrimaryButton label={placementCopy.start} onPress={flow.start} />
      <OutlineButton label={placementCopy.skip} onPress={flow.skip} />
    </View>
  );
}

/** Where the learner starts, and the way to the feed. */
function Result({ line, flow }: { line: string; flow: Flow }) {
  return (
    <View style={styles.section}>
      <View accessibilityLiveRegion="polite">
        <Text style={styles.title}>{line}</Text>
      </View>
      <PrimaryButton label={placementCopy.goToFeed} onPress={flow.goToFeed} />
    </View>
  );
}

/** The screen's content for `step`. */
function StepView({ step, flow }: { step: PlacementStep; flow: Flow }) {
  switch (step.kind) {
    case 'loading':
      return <LoadingState label={copy.loading} />;
    case 'failed':
      return (
        <ErrorScreen
          message={placementCopy.failed}
          actionLabel={placementCopy.goToFeed}
          onAction={flow.goToFeed}
        />
      );
    case 'intro':
      return <Intro total={step.total} flow={flow} />;
    case 'result':
      return <Result line={step.line} flow={flow} />;
    case 'card': {
      const card = step.quiz.cards[step.index];
      if (card === undefined) return null;
      return (
        <View style={styles.cardArea}>
          <View accessibilityLiveRegion="polite">
            <Text style={styles.kicker}>
              {placementCopy.progress(step.index + 1, step.quiz.cards.length)}
            </Text>
          </View>
          <PlacementCard key={card.id} card={card} onPick={flow.pick} />
        </View>
      );
    }
  }
}

function PlacementFlow({ slug, calls }: { slug: string; calls: Placement }) {
  const flow = usePlacement(slug, calls, openFeed);
  return <StepView step={flow.step} flow={flow} />;
}

/**
 * The placement quiz (K19), opened once after a new enrollment (a 201) with the API: an intro,
 * the quiz and predict cards one at a time with no answer shown, then where the learner starts and
 * the way to the feed (`usePlacement`). The swipe back is off: the learner leaves by finishing or
 * skipping, so the feed always starts after the quiz. With the demo sets there is no placement:
 * the screen offers only the way to the feed.
 */
export default function PlacementScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View testID="placement-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {placement === null ? (
          <ErrorScreen
            message={placementCopy.fromTheBeginning}
            actionLabel={placementCopy.goToFeed}
            onAction={openFeed}
          />
        ) : (
          <PlacementFlow slug={slug} calls={placement} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    flexGrow: 1,
    paddingHorizontal: PADDING_X,
    paddingTop: space[6],
    paddingBottom: space[8],
  },
  section: { gap: space[4] },
  cardArea: { flexGrow: 1, gap: space[3] },
  kicker: { ...type.kicker, color: colors.neutral[700] },
  title: { ...type.tabTitle, color: colors.ink },
  body: { ...type.body, color: colors.ink },
});
