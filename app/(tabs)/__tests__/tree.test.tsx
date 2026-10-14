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
    { id: 'm1', position: 1, title: 'First sounds', earned: 12, target: 100 },
    { id: 'm2', position: 2, title: 'Mini-notation', earned: 0, target: 280 },
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
    expect(screen.getByRole('progressbar', { name: '12 / 380 points' })).toBeOnTheScreen();
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

  it("draws each section's earned over target points as a line and a bar", async () => {
    await renderTree({ 'GET /topics/strudel/tree': [json(200, TREE)] });

    const first = screen.getByRole('progressbar', { name: '12 / 100 points' });
    expect(within(first).getByText('12 / 100 points')).toBeOnTheScreen();
    expect(first.props.accessibilityValue).toStrictEqual({ min: 0, max: 100, now: 12 });
    expect(viewStyleOf(within(first).getByTestId('points-fill')).flex).toBe(12);
    const second = screen.getByRole('progressbar', { name: '0 / 280 points' });
    expect(viewStyleOf(within(second).getByTestId('points-fill')).flex).toBe(0);
    // Other skills belongs to no milestone: it has no points of its own.
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
  });

  it("draws the topic's bar as the sum of its sections: 12 / 380 is 3%", async () => {
    await renderTree({ 'GET /topics/strudel/tree': [json(200, TREE)] });

    const overall = screen.getByRole('progressbar', { name: '12 / 380 points' });
    expect(within(overall).getByText('12 / 380 points')).toBeOnTheScreen();
    expect(overall.props.accessibilityValue).toStrictEqual({ min: 0, max: 100, now: 3 });
    expect(viewStyleOf(within(overall).getByTestId('points-fill'))).toMatchObject({
      flex: 3,
      backgroundColor: colors.lime,
    });
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('fills the bar of a section at its target', async () => {
    const [first, second] = TREE.milestones;
    const milestones = [{ ...first, earned: 100, target: 100 }, second];
    await renderTree({ 'GET /topics/strudel/tree': [json(200, { ...TREE, milestones })] });

    const section = screen.getByRole('progressbar', { name: '100 / 100 points' });
    expect(within(section).getByText('100 / 100 points')).toBeOnTheScreen();
    expect(viewStyleOf(within(section).getByTestId('points-fill')).flex).toBe(100);
    expect(viewStyleOf(within(section).getByTestId('points-rest')).flex).toBe(0);
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
