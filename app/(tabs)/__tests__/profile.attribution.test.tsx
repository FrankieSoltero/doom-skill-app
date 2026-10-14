// The Profile tab's footer: the topic catalog's attribution (app/(tabs)/profile.tsx; plan C9),
// over the real API client and a fake network. The rest of the tab is in profile.test.tsx.
import { screen } from '@testing-library/react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { renderScreen } from '../../../src/components/testing/screen';
import { copy } from '../../../src/copy';
import { deviceTimezone } from '../../../src/profile/useProfile';
import ProfileScreen from '../profile';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const ATTRIBUTION =
  'Topic names from Wikipedia and Stack Overflow (CC BY-SA 4.0), Wikidata (CC0) and the Library of Congress.';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('ends the loaded profile with the topic catalog’s attribution', async () => {
  serveApi({
    'GET /me': [
      json(200, {
        id: 'user-1',
        display_name: null,
        daily_minutes: 10,
        push_time: null,
        timezone: deviceTimezone(),
        created_at: '2026-09-28T12:00:00Z',
        leaderboard_opt_in: false,
      }),
    ],
  });
  await renderScreen(<ProfileScreen />);

  expect(copy.profile.attribution).toBe(ATTRIBUTION);
  const line = screen.getByText(copy.profile.attribution);
  const texts = screen.UNSAFE_root.findAll((node) => typeof node.props.children === 'string');
  expect(texts.at(-1)?.props.children).toBe(ATTRIBUTION);
  expect(line).toBeOnTheScreen();
});
