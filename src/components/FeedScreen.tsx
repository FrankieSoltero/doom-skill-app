import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBody } from '../cards/CardText';
import { canRenderCard, renderCard, renderSummary } from '../cards/registry';
import { copy } from '../copy';
import type { Card, CardSource, FeedSet } from '../data';
import { useFeedStore } from '../feed/store';
import { useFeedSession } from '../feed/useFeedSession';
import { colors, type } from '../theme';
import { CardFrame } from './CardFrame';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorScreen } from './ErrorScreen';
import { FeedHeader } from './FeedHeader';
import { FeedPager } from './FeedPager';
import { PrimaryButton } from './PrimaryButton';
import { Toast } from './Toast';

type CardDrawer = typeof renderCard;
type SummaryDrawer = typeof renderSummary;
type FeedSession = ReturnType<typeof useFeedSession>;

/** Shown while the first set loads; see `FeedScreen` for the screen-reader choice. */
function FeedLoading() {
  return (
    <View
      testID="feed-loading"
      style={styles.loading}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={copy.loading}
      accessibilityState={{ busy: true }}
    >
      <Text style={styles.loadingText}>{copy.loading}</Text>
    </View>
  );
}

type FailedCardProps = { card: Card; onNext: () => void; onShown: () => void };

/**
 * Drawn in place of a card that threw while rendering: a frame of the card's type, a line saying
 * it could not be shown, and Next card. `onShown` runs once it is on screen, so the session can
 * count the card as answered and the learner is not held behind it.
 */
function FailedCard({ card, onNext, onShown }: FailedCardProps) {
  const shown = useEffectEvent(onShown);
  useEffect(() => {
    shown();
  }, []);

  return (
    <CardFrame type={card.type} kicker={copy.cardTypes[card.type]}>
      <CardBody text={copy.cardFailed} />
      <View style={styles.fill} />
      <PrimaryButton
        label={copy.nextCard}
        onPress={onNext}
        variant={card.type === 'exercise' ? 'paper' : 'ink'}
      />
    </CardFrame>
  );
}

type CardPageProps = {
  card: Card;
  index: number;
  /** The set round the page was drawn for; its key includes it, so it never changes. */
  round: number;
  session: FeedSession;
  drawCard: CardDrawer;
};

type DrawnCardProps = { card: Card; slot: Parameters<CardDrawer>[1]; drawCard: CardDrawer };

/** Calls `drawCard` while rendering, so an error it throws reaches the page's boundary. */
function DrawnCard({ card, slot, drawCard }: DrawnCardProps) {
  return drawCard(card, slot);
}

/**
 * One card's page: the card, or its fallback if it fails to render. Its `onNext` is bound to this
 * page and this round: called while another page is current, or after a new set has started (a
 * late timer), it does nothing.
 */
function CardPage({ card, index, round, session, drawCard }: CardPageProps) {
  const onNext = () => {
    session.nextFrom(index, round);
  };
  const slot = { index, active: index === session.index, onNext };
  const fallback = (
    <FailedCard
      card={card}
      onNext={onNext}
      onShown={() => {
        session.markFailed(index);
      }}
    />
  );

  return (
    <ErrorBoundary name="card" fallback={fallback}>
      <DrawnCard card={card} slot={slot} drawCard={drawCard} />
    </ErrorBoundary>
  );
}

/**
 * How the ready feed draws a card and the Summary, what the Summary's `View skill tree` does, and
 * what the no-topic screen's button does.
 */
type ScreenActions = {
  drawCard: CardDrawer;
  drawSummary: SummaryDrawer;
  onViewTree: () => void;
  onExplore: () => void;
};

type DrawnSummaryProps = {
  drawSummary: SummaryDrawer;
  props: Parameters<SummaryDrawer>[0];
};

/** Calls `drawSummary` while rendering, so an error it throws reaches the Summary's boundary. */
function DrawnSummary({ drawSummary, props }: DrawnSummaryProps) {
  return drawSummary(props);
}

type FailedSummaryProps = {
  set: FeedSet;
  status: FeedSession['nextSetStatus'];
  /** Loads the next set; also what Retry does. */
  onKeepGoing: () => void;
};

/**
 * Drawn in place of a Summary that threw while rendering: the Summary's ink frame and kicker, a
 * line saying it could not be shown, and one lime button that loads the next set, so the learner
 * can go on without losing the day. The button reads `Keep going`, is disabled while the set
 * loads, reads `Retry` after a failed load, and is gone when the source has no more sets. It is
 * drawn here rather than through `SummaryActions`, which may be what threw.
 */
function FailedSummary({ set, status, onKeepGoing }: FailedSummaryProps) {
  const label = status === 'error' ? copy.retry : copy.keepGoing;
  return (
    <CardFrame type="summary" kicker={copy.dayComplete(set.topic.day)}>
      <CardBody text={copy.cardFailed} />
      <View style={styles.fill} />
      {status === 'none' ? null : (
        <PrimaryButton
          label={label}
          onPress={onKeepGoing}
          disabled={status === 'loading'}
          variant="lime"
        />
      )}
    </CardFrame>
  );
}

type ReadyFeedProps = ScreenActions & { set: FeedSet; session: FeedSession };

/**
 * The feed header over the pager, which fills the rest. Each card is a page, then the Summary,
 * whose `Keep going` loads the next set. A new set's pages get new keys (the store's round), so
 * every card of it starts fresh and the old set's cards unmount.
 */
function ReadyFeed({ set, session, drawCard, drawSummary, onViewTree }: ReadyFeedProps) {
  const streak = useFeedStore((state) => state.streak);
  const round = String(session.setRound);
  const onKeepGoing = () => {
    void session.loadNextSet();
  };
  const failedSummary = (
    <FailedSummary set={set} status={session.nextSetStatus} onKeepGoing={onKeepGoing} />
  );
  const pages: ReactNode[] = [
    ...set.cards.map((card, index) => (
      <CardPage
        key={`${round}-${String(index)}`}
        card={card}
        index={index}
        round={session.setRound}
        session={session}
        drawCard={drawCard}
      />
    )),
    <ErrorBoundary key={`${round}-summary`} name="summary" fallback={failedSummary}>
      <DrawnSummary
        drawSummary={drawSummary}
        props={{
          set,
          active: session.index === set.cards.length,
          onKeepGoing,
          onViewTree,
          nextSetStatus: session.nextSetStatus,
        }}
      />
    </ErrorBoundary>,
  ];

  return (
    <>
      <FeedHeader set={set} index={session.index} streak={streak} />
      <FeedPager
        pages={pages}
        index={session.index}
        canAdvance={session.canAdvance}
        onIndexChange={session.goTo}
        onBlocked={session.blocked}
        overlay={<Toast message={copy.answerToContinue} visible={session.toastVisible} />}
      />
    </>
  );
}

/** The screen's body for the session's state. */
function FeedBody({ session, ...actions }: ScreenActions & { session: FeedSession }) {
  if (session.status === 'error') {
    return (
      <ErrorScreen message={copy.loadFailed} actionLabel={copy.retry} onAction={session.retry} />
    );
  }
  if (session.status === 'noTopic') {
    return (
      <ErrorScreen
        message={copy.noTopic}
        actionLabel={copy.exploreTopics}
        onAction={actions.onExplore}
      />
    );
  }
  if (session.status === 'empty') return <ErrorScreen message={copy.nothingYet} />;
  if (session.set === null) return <FeedLoading />;
  return <ReadyFeed set={session.set} session={session} {...actions} />;
}

/** Switches to the Tree tab: what the Summary's `View skill tree` does in the app. */
export function openSkillTree(): void {
  router.navigate('/tree');
}

/** Switches to the Explore tab: what the no-topic screen's button does in the app. */
function openExplore(): void {
  router.navigate('/explore');
}

type FeedScreenProps = {
  /** Where the sets come from. The Today route passes the app's `cardSource`. */
  source: CardSource;
  /** Draws a card. The registry's `renderCard` unless a test passes its own. */
  renderCard?: CardDrawer;
  /** Which cards `renderCard` can draw; the others are left out of the set. The registry's by default. */
  canRenderCard?: (card: Card) => boolean;
  /** Draws the Summary. The registry's `renderSummary` unless a test passes its own. */
  renderSummary?: SummaryDrawer;
  /** What the Summary's `View skill tree` does. `openSkillTree` unless a test passes its own. */
  onViewTree?: () => void;
  /** What the no-topic screen's button does. Switches to Explore unless a test passes its own. */
  onExplore?: () => void;
};

/**
 * The Today feed (docs/design/card-feed/README.md:24-45): on a paper ground, while the first set
 * loads, a loading line; then the feed header over the pager, with the gating toast over the
 * pager's foot. A failed load shows an error screen with Retry; a source with nothing to give
 * shows one without; with no active topic, one with a button to Explore. Card types the registry cannot draw are left out of the set. The tab bar
 * belongs to the tab layout, not to this screen.
 *
 * The root pads for the top safe-area inset in every state; the tab bar below it covers the
 * bottom. The loading line is a `progressbar` rather than a
 * live region: it is the screen's only content when the tab opens, so a screen reader lands on it
 * and hears "Loading…, progress", and its text never changes, which is all a live region would
 * announce (and iOS has no live regions).
 */
export function FeedScreen({
  source,
  renderCard: drawCard = renderCard,
  canRenderCard: canDraw = canRenderCard,
  renderSummary: drawSummary = renderSummary,
  onViewTree = openSkillTree,
  onExplore = openExplore,
}: FeedScreenProps) {
  const insets = useSafeAreaInsets();
  const session = useFeedSession(source, canDraw);

  return (
    <View testID="today-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <FeedBody
        session={session}
        drawCard={drawCard}
        drawSummary={drawSummary}
        onViewTree={onViewTree}
        onExplore={onExplore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...type.body, color: colors.neutral[700] },
});
