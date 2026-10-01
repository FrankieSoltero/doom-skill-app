// The Explore tab (app/(tabs)/explore.tsx), over the real API client and a fake network.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen, SCREEN_TOP_INSET } from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { colors } from '../../../src/theme';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import ExploreScreen from '../explore';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const topic = (slug: string, title: string, status: string) => ({
  slug,
  title,
  status,
  description: null,
});
const STRUDEL = topic('strudel', 'Strudel', 'ready');
const BUILDING = topic('sql', 'SQL window functions', 'ingesting');
const RUST = topic('rust-ownership', 'Rust ownership', 'pending');
const job = (status: string) =>
  json(200, { id: 'job-1', kind: 'k', progress: {}, reason: null, status });

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderExplore(routes: Parameters<typeof serveApi>[0]) {
  const requests = serveApi(routes);
  await renderScreen(<ExploreScreen />);
  return requests;
}

async function search(text: string) {
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
}

describe('Explore: idle and loading', () => {
  it('shows the title, the search field and a hint, on paper below the inset', async () => {
    await renderExplore({});

    expect(screen.getByRole('header', { name: 'Explore' })).toBeOnTheScreen();
    const field = screen.getByLabelText('Search topics');
    expect(field).toHaveProp('maxLength', 80);
    expect(field).toHaveProp('placeholder', 'Learn anything technical…');
    expect(screen.getByText('Search for a topic to learn.')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('explore-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });

  it('shows a busy line while it waits for the search', async () => {
    await renderExplore({});
    fireEvent.changeText(screen.getByLabelText('Search topics'), 'stru');

    expect(screen.getByRole('progressbar', { name: 'Searching…' })).toBeOnTheScreen();
  });
});

describe('Explore: results', () => {
  it('lists the topics found; a ready one opens its detail, one being built does not', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(200, { topics: [STRUDEL, BUILDING] })],
    });
    await search('s');

    expect(requests.map((r) => r.query)).toStrictEqual(['?q=s']);
    expect(screen.getByText('SQL window functions')).toBeOnTheScreen();
    expect(screen.getByText('Being built')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open SQL window functions' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Open Strudel' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it('shows a failed search with Retry, which asks again', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(500, {}), json(200, { topics: [STRUDEL] })],
    });
    await search('strudel');
    expect(screen.getByText("Couldn't search topics.")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await advance(0);

    expect(requests).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open Strudel' })).toBeOnTheScreen();
  });
});

describe('Explore: creating a topic', () => {
  it('offers Create for no match; a new topic shows its card, which opens once built', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(200, { topics: [] }), json(200, { topics: [RUST] })],
      'POST /topics': [json(202, { topic: RUST, job_id: 'job-1' })],
      'GET /jobs/job-1': [job('running'), job('done')],
    });
    await search('  Rust ownership ');
    expect(screen.getByText('No topic matches that yet.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);
    expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
      query: 'Rust ownership',
    });
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
    const card = screen.getByRole('button', { name: 'Open Rust ownership' });
    expect(card).toBeDisabled();

    await advance(3000);
    expect(screen.getByText('Ready. Tap to open.')).toBeOnTheScreen();
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'rust-ownership' },
    });
  });

  it('opens a topic that already exists', async () => {
    await renderExplore({
      'GET /topics': [json(200, { topics: [] })],
      'POST /topics': [json(200, { topic: STRUDEL, job_id: null })],
    });
    await search('strudel.cc');
    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it.each([
    { status: 422, line: 'Not available yet' },
    { status: 429, line: 'You have too many topics being built. Try again later.' },
    { status: 500, line: "Couldn't create the topic. Try again." },
  ])('shows one fixed line for a $status', async ({ status, line }) => {
    await renderExplore({
      'GET /topics': [json(200, { topics: [] })],
      'POST /topics': [json(status, { detail: 'server text' })],
    });
    await search('cobol');
    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.queryByText('server text')).toBeNull();
  });
});
