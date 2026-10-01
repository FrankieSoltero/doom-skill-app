// The Tree tab (app/(tabs)/tree.tsx), over the real API client and a fake network.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { useSession } from '../../../src/auth/useSession';
import { pressRetry, renderScreen, SCREEN_TOP_INSET } from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { loadActiveTopic } from '../../../src/feed/useActiveTopic';
import { colors } from '../../../src/theme';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import TreeScreen from '../tree';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const node = (title: string, milestone: string | null, mastery: number, unlocked = true) => ({
  id: title,
  slug: title.toLowerCase(),
  title,
  summary: '',
  estimated_minutes: 5,
  milestone_id: milestone,
  mastery,
  unlocked,
});
const TREE = {
  topic: {
    slug: 'strudel',
    title: 'Strudel',
    description: null,
    status: 'ready',
    end_state: 'Write a 16-bar layered piece from a blank editor.',
  },
  milestones: [
    { id: 'm1', position: 1, title: 'First sounds' },
    { id: 'm2', position: 2, title: 'Mini-notation' },
  ],
  nodes: [
    node('The REPL', 'm1', 1),
    node('Rests', 'm2', 0.36),
    node('Euclid', 'm2', 0, false),
    node('Tempo', null, 0),
  ],
  edges: [],
};

async function chooseTopic(slug: string | null) {
  await AsyncStorage.clear();
  if (slug !== null) {
    await AsyncStorage.setItem('activeTopic', JSON.stringify({ owner: 'user-1', slug }));
  }
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await loadActiveTopic();
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.mocked(router.navigate).mockClear();
  await chooseTopic('strudel');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderTree(routes: Parameters<typeof serveApi>[0]) {
  const requests = serveApi(routes);
  await renderScreen(<TreeScreen />);
  return requests;
}

describe('Tree: without a topic', () => {
  it('asks to pick a topic, with a button to Explore, and asks nothing', async () => {
    await chooseTopic(null);
    const requests = await renderTree({});

    expect(screen.getByRole('header', { name: 'Skill tree' })).toBeOnTheScreen();
    expect(screen.getByText('Pick a topic to see its skill tree.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Explore topics' }));
    expect(router.navigate).toHaveBeenCalledWith('/explore');
    expect(requests).toHaveLength(0);
    expect(viewStyleOf(screen.getByTestId('tree-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });
});

describe('Tree: the active topic', () => {
  it('shows a busy line while the tree loads', async () => {
    await renderTree({ 'GET /topics/strudel/tree': [new Promise<Response>(() => undefined)] });

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });

  it('shows the topic, its end state, its progress and one section per milestone', async () => {
    await renderTree({ 'GET /topics/strudel/tree': [json(200, TREE)] });

    expect(screen.getByText('Skill tree')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Strudel' })).toBeOnTheScreen();
    expect(screen.getByText(TREE.topic.end_state)).toBeOnTheScreen();
    expect(screen.getByText('34%')).toBeOnTheScreen();
    const sections = screen.getAllByTestId('milestone-section').map((section) => within(section));
    expect(sections).toHaveLength(3);
    const [first, second, other] = sections;
    expect(first?.getByRole('header', { name: 'First sounds' })).toBeOnTheScreen();
    expect(first?.getByLabelText('The REPL, 100% mastered')).toBeOnTheScreen();
    expect(second?.getByLabelText('Rests, 36% mastered')).toBeOnTheScreen();
    expect(second?.getByLabelText('Euclid, locked')).toBeOnTheScreen();
    expect(other?.getByRole('header', { name: 'Other skills' })).toBeOnTheScreen();
    expect(other?.getByLabelText('Tempo, 0% mastered')).toBeOnTheScreen();
  });

  it('says a topic with no nodes has no skills yet', async () => {
    await renderTree({ 'GET /topics/strudel/tree': [json(200, { ...TREE, nodes: [] })] });

    expect(screen.getByText('This topic has no skills yet.')).toBeOnTheScreen();
  });

  it.each([
    { status: 500, line: "Couldn't load the skill tree." },
    { status: 409, line: 'This skill tree is still being built.' },
  ])('shows a $status with Retry, which asks again', async ({ status, line }) => {
    const requests = await renderTree({
      'GET /topics/strudel/tree': [json(status, { detail: 'server text' }), json(200, TREE)],
    });
    expect(screen.getByText(line)).toBeOnTheScreen();

    await pressRetry();

    expect(requests).toHaveLength(2);
    expect(screen.getByRole('header', { name: 'Strudel' })).toBeOnTheScreen();
  });
});
