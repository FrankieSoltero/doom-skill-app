import { FeedScreen } from '../../src/components/FeedScreen';
import { cardSource } from '../../src/data';

/** The Today tab, the `/` route: the card feed over the app's card source. */
export default function TodayScreen() {
  return <FeedScreen source={cardSource} />;
}
