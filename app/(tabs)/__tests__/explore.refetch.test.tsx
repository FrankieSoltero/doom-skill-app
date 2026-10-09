// The Explore tab's My topics when a re-read fails (app/(tabs)/explore.tsx), over the real API
// client and a fake network. The rest of the tab is in explore.test.tsx.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import {
  useFocusEffect as mockUseFocusEffect,
  setFocused,
} from '../../../src/topics/testing/focus';
import type { Enrollment } from '../../../src/topics/useEnrollments';
import ExploreScreen from '../explore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const enrollment = (topic_slug: string, last_studied_at: string): Enrollment => ({
  status: 'active',
  daily_minutes: 15,
  horizon_days: 14,
  progress: 0.25,
  topic_slug,
  topic_title: topic_slug,
  started_at: '2026-09-30T12:00:00Z',
  level: 1,
  last_studied_at,
});
const OLDER = enrollment('strudel', '2026-10-01T09:00:00Z');
const NEWER = enrollment('sql', '2026-10-08T09:00:00Z');
const FAILED = "Couldn't load your topics.";

beforeEach(() => {
  jest.useFakeTimers();
  setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderAfterGoodRead() {
  serveApi({
    'GET /me/enrollments': [
      json(200, { enrollments: [OLDER, NEWER] }),
      json(500, { detail: 'server text' }),
    ],
  });
  await renderScreen(<ExploreScreen />);
  expect(screen.getByTestId('my-topic-sql')).toBeOnTheScreen();
  expect(screen.queryByTestId('explore-my-topics-failed')).toBeNull();
}

/** The failure line, and the list it follows, after a good read. */
function expectListThenFailure() {
  expect(screen.getByTestId('my-topic-sql')).toBeOnTheScreen();
  expect(screen.getByTestId('my-topic-strudel')).toBeOnTheScreen();
  expect(screen.getByText(FAILED)).toHaveProp('testID', 'explore-my-topics-failed');
  expect(screen.queryByText('server text')).toBeNull();
  const lines = screen.getAllByText(/^(My topics|Couldn't load your topics\.)$/);
  expect(lines.map((line) => line.props.children as string)).toStrictEqual(['My topics', FAILED]);
}

describe('Explore: my topics, a failed re-read', () => {
  it('keeps the cached list and adds the failure line under it, on a focus re-read', async () => {
    await renderAfterGoodRead();

    act(() => {
      setFocused(false);
    });
    act(() => {
      setFocused(true);
    });
    await advance(0);

    expectListThenFailure();
  });

  it('keeps the cached list and adds the failure line under it, on pull to refresh', async () => {
    await renderAfterGoodRead();

    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await advance(0);

    expectListThenFailure();
  });
});
