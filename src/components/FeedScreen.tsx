import { useEffect, useEffectEvent } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBody } from '../cards/CardText';
import { canRenderCard, renderCard } from '../cards/registry';
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

type ReadyFeedProps = { set: FeedSet; session: FeedSession; drawCard: CardDrawer };

/**
 * The feed header over the pager, which fills the rest. Each card is a page, then the Summary. A
 * new set's pages get new keys, so every card of it starts fresh.
 */
function ReadyFeed({ set, session, drawCard }: ReadyFeedProps) {
  const streak = useFeedStore((state) => state.streak);
  const round = String(session.setRound);
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
    // The Summary card is Task 28; until then its page is an empty placeholder.
    <View key={`${round}-summary`} testID="summary-page" style={styles.fill} />,
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
function FeedBody({ session, drawCard }: { session: FeedSession; drawCard: CardDrawer }) {
  if (session.status === 'error') {
    return (
      <ErrorScreen message={copy.loadFailed} actionLabel={copy.retry} onAction={session.retry} />
    );
  }
  if (session.status === 'empty') return <ErrorScreen message={copy.nothingYet} />;
  if (session.set === null) return <FeedLoading />;
  return <ReadyFeed set={session.set} session={session} drawCard={drawCard} />;
}

type FeedScreenProps = {
  /** Where the sets come from. The Today route passes the app's `cardSource`. */
  source: CardSource;
  /** Draws a card. The registry's `renderCard` unless a test passes its own. */
  renderCard?: CardDrawer;
  /** Which cards `renderCard` can draw; the others are left out of the set. The registry's by default. */
  canRenderCard?: (card: Card) => boolean;
};

/**
 * The Today feed (docs/design/card-feed/README.md:24-45): on a paper ground, while the first set
 * loads, a loading line; then the feed header over the pager, with the gating toast over the
 * pager's foot. A failed load shows an error screen with Retry; a source with nothing to give
 * shows one without. Card types the registry cannot draw are left out of the set. The tab bar
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
}: FeedScreenProps) {
  const insets = useSafeAreaInsets();
  const session = useFeedSession(source, canDraw);

  return (
    <View testID="today-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <FeedBody session={session} drawCard={drawCard} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...type.body, color: colors.neutral[700] },
});
