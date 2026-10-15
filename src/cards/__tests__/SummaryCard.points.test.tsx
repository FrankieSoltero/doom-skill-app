// The Summary card's points tile (section points): the points the set earned (the feed store's
// `pointsEarned`, summed from the attempts' replies) over the section line of the set's last card,
// read from the topic's tree, which the card asks for again once it is the current page and the
// outbox has sent every attempt, so the section's points include the set.
import { act, render, screen, within } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { viewStyleOf } from '../../components/testing/styles';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import type { Tree } from '../../topics/useTree';
import { useFocusEffect as mockUseFocusEffect } from '../../topics/testing/focus';
import { colors } from '../../theme';
import { SummaryCard } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));
// The outbox's count of attempts not yet sent, which the test sets.
const mockPending = { count: 0, listeners: new Set<() => void>() };
jest.mock('../../feed/outbox', () => ({
  outbox: {
    pending: () => mockPending.count,
    subscribe: (listener: () => void) => {
      mockPending.listeners.add(listener);
      return () => {
        mockPending.listeners.delete(listener);
      };
    },
  },
}));

/** Sets the outbox's count and tells the card. */
function setPending(count: number) {
  act(() => {
    mockPending.count = count;
    mockPending.listeners.forEach((listener) => {
      listener();
    });
  });
}

const TREE_PATH = 'GET /topics/strudel/tree';

/** The Strudel tree with its first section, Rhythm basics (the set's node), at `earned`/100. */
function treeWith(earned: number): Tree {
  return {
    topic: {
      slug: 'strudel',
      title: 'Strudel',
      description: null,
      status: 'ready',
      end_state: null,
    },
    milestones: [
      { id: 'm1', position: 1, title: 'Rhythm basics', earned, target: 100 },
      { id: 'm2', position: 2, title: 'Layering', earned: 0, target: 280 },
    ],
    nodes: [
      {
        id: 'n1',
        slug: 'mini-notation',
        title: 'mini-notation',
        summary: '',
        estimated_minutes: 5,
        milestone_id: 'm1',
        mastery: 0.2,
        unlocked: true,
      },
    ],
    edges: [],
  };
}

/** Lets the card's requests answer. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Renders the card in a fresh cache (given `cached`, holding that tree already) and settles. */
async function renderCard({ active = true, cached }: { active?: boolean; cached?: Tree } = {}) {
  const { client, wrapper: Cache } = queryWrapper();
  if (cached !== undefined) client.setQueryData(['tree', 'strudel'], cached);
  const element = (isActive: boolean) => (
    <Cache>
      <SummaryCard
        set={summarySet()}
        active={isActive}
        onKeepGoing={jest.fn()}
        onViewTree={jest.fn()}
        nextSetStatus="idle"
      />
    </Cache>
  );
  const view = render(element(active));
  await settle();
  return {
    activate: async () => {
      view.rerender(element(true));
      await settle();
    },
  };
}

const tile = () => screen.getByTestId('points-tile');
const treeRequests = (requests: { method: string; path: string }[]) =>
  requests.filter((request) => `${request.method} ${request.path}` === TREE_PATH);

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  mockPending.count = 0;
  mockPending.listeners.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SummaryCard points tile', () => {
  it('shows "+17 points" after replies of 5, 0, 2 and 10, on aqua', async () => {
    serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });
    [5, 0, 2, 10].forEach((points) => {
      useFeedStore.getState().addPoints(points);
    });

    await renderCard();

    expect(within(tile()).getByText('+17 points')).toBeOnTheScreen();
    expect(viewStyleOf(tile()).backgroundColor).toBe(colors.aqua);
  });

  it('shows "+0 points" for a set that earned none', async () => {
    serveApi({ [TREE_PATH]: [json(200, treeWith(0))] });
    useFeedStore.getState().addPoints(0);

    await renderCard();

    expect(within(tile()).getByText('+0 points')).toBeOnTheScreen();
  });

  it('marks provisional points "syncing" on the points line, and drops the mark once settled', async () => {
    serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });
    act(() => {
      useFeedStore.getState().startSet(makeSet(0, [{ ...cardsByType.quiz, id: 'card-1' }]));
      useFeedStore.getState().addProvisional('card-1', 5, { kind: 'quiz', correct: true });
    });

    await renderCard();
    expect(within(tile()).getByText('+5 points')).toBeOnTheScreen();
    expect(within(tile()).getByText('syncing')).toBeOnTheScreen();
    expect(screen.getAllByText('syncing')).toHaveLength(1);

    act(() => {
      useFeedStore.getState().settle('card-1', 5);
    });
    expect(within(tile()).getByText('+5 points')).toBeOnTheScreen();
    expect(screen.queryByText('syncing')).toBeNull();
  });

  it("shows the section of the set's last card under the points, from one tree request", async () => {
    const requests = serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });

    await renderCard();

    expect(within(tile()).getByText('Rhythm basics: 12 / 100 points')).toBeOnTheScreen();
    expect(treeRequests(requests)).toHaveLength(1);
  });

  it('asks for a tree it already holds again on mount, and shows the new points', async () => {
    const requests = serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });

    await renderCard({ cached: treeWith(4) });

    expect(treeRequests(requests)).toHaveLength(1);
    expect(within(tile()).getByText('Rhythm basics: 12 / 100 points')).toBeOnTheScreen();
    expect(screen.queryByText(/4 \/ 100/)).toBeNull();
  });

  it('leaves the section line out when the tree fails, and never shows the error', async () => {
    serveApi({ [TREE_PATH]: [json(500, { detail: 'server text' })] });
    useFeedStore.getState().addPoints(3);

    await renderCard();

    expect(tile()).toHaveTextContent('+3 points', { exact: true });
    expect(screen.queryByText(/server text|Couldn't/)).toBeNull();
  });

  it('asks for no tree until the Summary is the current page', async () => {
    const requests = serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });

    const card = await renderCard({ active: false });
    expect(treeRequests(requests)).toHaveLength(0);
    expect(tile()).toHaveTextContent('+0 points', { exact: true });

    await card.activate();
    expect(treeRequests(requests)).toHaveLength(1);
    expect(within(tile()).getByText('Rhythm basics: 12 / 100 points')).toBeOnTheScreen();
  });

  it('waits for the outbox to send every attempt before it asks for the tree', async () => {
    const requests = serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });
    mockPending.count = 1;

    await renderCard();
    expect(treeRequests(requests)).toHaveLength(0);

    setPending(0);
    await settle();
    expect(treeRequests(requests)).toHaveLength(1);
    expect(within(tile()).getByText('Rhythm basics: 12 / 100 points')).toBeOnTheScreen();
  });

  it('draws no other points line and no mastery-based topic progress', async () => {
    serveApi({ [TREE_PATH]: [json(200, treeWith(12))] });
    useFeedStore.getState().addPoints(3);

    await renderCard();

    expect(screen.getAllByText('+3 points')).toHaveLength(1);
    expect(screen.queryByText(/topic progress|%/)).toBeNull();
  });
});
