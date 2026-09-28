// The kicker and meta strings every card shows in its kicker row (docs/design/card-feed/README.md:47).
import { copy } from '../copy';
import type { Card } from '../data';

/** The fields the kicker reads, from any card type that names a node. */
type NodeFields = Pick<Extract<Card, { node: string }>, 'type' | 'node'>;

/** Below this many seconds the estimate is in seconds; from here up, in minutes. */
const MINUTES_FROM = 120;
const SECONDS_PER_MINUTE = 60;

/**
 * The kicker of a card that names its node: type name, middle dot, node, such as
 * `Concept · Mini-notation` (README.md:52). The kicker style shows it uppercase. Review and
 * checkpoint cards write their own kickers (README.md:115, :124).
 */
export function cardKickerText(card: NodeFields): string {
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
