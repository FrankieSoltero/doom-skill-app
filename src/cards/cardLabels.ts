// The kicker and meta strings every card shows in its kicker row (docs/design/card-feed/README.md:47).
import { copy } from '../copy';
import type { Card } from '../data';

/**
 * The fields the kicker reads, from the four card types whose kicker is type and node. Review and
 * checkpoint cards are left out: their kickers are built from other fields.
 */
type NodeKickerFields = Pick<
  Extract<Card, { type: 'concept' | 'quiz' | 'predict' | 'exercise' }>,
  'type' | 'node'
>;

/** Below this many seconds the estimate is in seconds; from here up, in minutes. */
const MINUTES_FROM = 120;
const SECONDS_PER_MINUTE = 60;

/**
 * The kicker of a concept, quiz, predict or exercise card: type name, middle dot, node, such as
 * `Concept · Mini-notation` (README.md:52). The kicker style shows it uppercase. It accepts no
 * other card type: a review card's kicker is built from `lastSeenDays` ("REVIEW · SEEN 3 DAYS
 * AGO", README.md:115) and a checkpoint card's from its milestone (README.md:124), so each of
 * those cards writes its own.
 */
export function cardKickerText(card: NodeKickerFields): string {
  return copy.cardKicker(copy.cardTypes[card.type], card.node);
}

/**
 * A card's estimated time: `~40 s` under two minutes, else whole minutes rounded to the nearest,
 * such as `~3 min` for 180 (README.md:52, :88, :124). The kicker style shows it uppercase.
 */
export function cardMetaText(estSeconds: number): string {
  return estSeconds < MINUTES_FROM
    ? copy.seconds(estSeconds)
    : copy.minutes(Math.round(estSeconds / SECONDS_PER_MINUTE));
}
