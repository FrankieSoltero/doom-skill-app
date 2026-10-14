// The Explore tab's catalog suggestions (app/(tabs)/explore.tsx, src/topics/useSuggest.ts), over
// the real API client and a fake network. The rest of the tab is in explore.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import ExploreScreen from '../explore';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
  router: { push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const suggestion = (key: string, label: string, group: string, built_slug: string | null) => ({
  key,
  label,
  group,
  kind: 'programming language',
  rank: 100,
  built_slug,
});
const C = suggestion('wikidata:Q15777', 'C (programming language)', 'code', null);
const CPP = suggestion('wikidata:Q2407', 'C++', 'code', 'cpp');
const SPAN = suggestion('wikidata:Q1023', 'C-SPAN', 'prose', null);
const STRUDEL = {
  slug: 'strudel',
  title: 'Strudel',
  status: 'ready',
  description: null,
  level: 1,
  parent_slug: null,
  levels: [{ slug: 'strudel', level: 1, status: 'ready', published: true }],
};
const PENDING_C = { ...STRUDEL, slug: 'c', title: 'C (programming language)', status: 'pending' };
const suggested = (...list: object[]) => json(200, { suggestions: list });
const found = (...list: object[]) => json(200, { topics: list });
const NOT_IN_CATALOG = 'Not in the catalog yet — you can still request it';

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function typeQuery(routes: Parameters<typeof serveApi>[0], text: string) {
  const requests = serveApi({ 'GET /me/enrollments': [json(200, { enrollments: [] })], ...routes });
  await renderScreen(<ExploreScreen />);
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
  return requests;
}

describe('Explore: catalog suggestions', () => {
  it('lists the suggestions above the results, with group chips and the built mark', async () => {
    await typeQuery(
      { 'GET /topics/suggest': [suggested(C, CPP, SPAN)], 'GET /topics': [found(STRUDEL)] },
      'c',
    );

    const rows = screen.getAllByTestId(/^(suggestion-row|topic-row)$/);
    expect(rows.map((row) => row.props.testID as string)).toStrictEqual([
      'suggestion-row',
      'suggestion-row',
      'suggestion-row',
      'topic-row',
    ]);
    expect(screen.getAllByText('code')).toHaveLength(2);
    expect(screen.getAllByText('prose')).toHaveLength(1);
    expect(screen.getAllByText('Built')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'C++, code, Built' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'C-SPAN, prose' })).toBeOnTheScreen();
    expect(screen.queryByText(NOT_IN_CATALOG)).toBeNull();
  });

  it('opens a built suggestion’s topic', async () => {
    await typeQuery({ 'GET /topics/suggest': [suggested(CPP)], 'GET /topics': [found()] }, 'c+');
    fireEvent.press(screen.getByRole('button', { name: 'C++, code, Built' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'cpp' },
    });
  });

  it('requests an unbuilt suggestion with its catalog key, then shows its card', async () => {
    const requests = await typeQuery(
      {
        'GET /topics/suggest': [suggested(C)],
        'GET /topics': [found()],
        'POST /topics': [json(202, { topic: PENDING_C, job_id: 'job-1' })],
        'GET /jobs/job-1': [
          json(200, { id: 'job-1', kind: 'k', progress: {}, reason: null, status: 'running' }),
        ],
      },
      'c',
    );
    fireEvent.press(screen.getByRole('button', { name: 'C (programming language), code' }));
    await advance(0);

    expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
      query: 'C (programming language)',
      catalog_key: 'wikidata:Q15777',
    });
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says the query is not in the catalog over Create when nothing matches', async () => {
    await typeQuery({ 'GET /topics/suggest': [suggested()], 'GET /topics': [found()] }, 'zzq');

    const lines = screen.getAllByText(/^(Not in the catalog yet|Create this topic)/);
    expect(lines.map((line) => line.props.children as string)).toStrictEqual([
      NOT_IN_CATALOG,
      'Create this topic',
    ]);
    expect(screen.getByRole('button', { name: 'Create this topic' })).toBeEnabled();
    expect(screen.queryByTestId('suggestion-row')).toBeNull();
  });

  it.each([
    { results: [STRUDEL], shows: 'Strudel' },
    { results: [], shows: 'No topic matches that yet.' },
  ])('shows nothing for a failed suggest; the search shows "$shows"', async (row) => {
    await typeQuery(
      {
        'GET /topics/suggest': [json(500, { detail: 'server text' })],
        'GET /topics': [found(...row.results)],
      },
      'str',
    );

    expect(screen.getByText(row.shows)).toBeOnTheScreen();
    expect(screen.queryByTestId('suggestion-row')).toBeNull();
    expect(screen.queryByText('server text')).toBeNull();
    expect(screen.queryByText(NOT_IN_CATALOG)).toBeNull();
  });
});
