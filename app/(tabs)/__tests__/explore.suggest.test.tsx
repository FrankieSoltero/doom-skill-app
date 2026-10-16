// The Explore tab's one result list (app/(tabs)/explore.tsx over src/topics/useExploreResults.ts):
// open topics with Open, catalog rows with Build. Over the real API client and a fake network.
// The rest of the tab is in explore.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi, type Answer } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import ExploreScreen, { EXPLORE_MAX_ROWS } from '../explore';

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
const CLOJURE = suggestion('wikidata:Q51798', 'Clojure', 'code', 'clojure');
const SPAN = suggestion('wikidata:Q1023', 'C-SPAN', 'prose', null);
const topic = (slug: string, title: string, status = 'ready') => ({
  slug,
  title,
  status,
  description: null,
  level: 1,
  parent_slug: null,
  levels: [{ slug, level: 1, status, published: true }],
});
const STRUDEL = topic('strudel', 'Strudel');
const CPP_TOPIC = topic('cpp', 'C++');
const COOKING = topic('cooking', 'Cooking');
const BUILDING_C = topic('c', 'C (programming language)', 'ingesting');
const TOP = 'GET /topics/suggest/top';
const SUGGEST = 'GET /topics/suggest';
const slice = (topics: object[], rows: object[] = []) => json(200, { topics, rows });
const suggested = (...list: object[]) => json(200, { suggestions: list });
const never = new Promise<Response>(() => undefined);
const running = json(200, {
  id: 'job-1',
  kind: 'k',
  progress: {},
  reason: null,
  status: 'running',
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function typeQuery(routes: Record<string, Answer[]>, text: string) {
  const requests = serveApi({ 'GET /me/enrollments': [json(200, { enrollments: [] })], ...routes });
  await renderScreen(<ExploreScreen />);
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
  return requests;
}

const posts = <T extends { method: string }>(requests: T[]) =>
  requests.filter((r) => r.method === 'POST');

describe('Explore: one list', () => {
  it('shows open topics and built rows with Open, then catalog rows with Build', async () => {
    await typeQuery(
      { [TOP]: [slice([CPP_TOPIC, COOKING])], [SUGGEST]: [suggested(C, CPP, SPAN, CLOJURE)] },
      'c',
    );

    const rows = screen.getAllByTestId('explore-row');
    expect(rows.map((row) => row.props.accessibilityLabel as string)).toStrictEqual([
      'C++, Open',
      'Cooking, Open',
      'Clojure, code, Open',
      'C (programming language), code, Build',
      'C-SPAN, prose, Build',
    ]);
    // The catalog's C++ row is the open topic C++: it shows once.
    expect(screen.getAllByText('C++')).toHaveLength(1);
    expect(screen.getAllByText('Open')).toHaveLength(3);
    expect(screen.getAllByText('Build')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Create/ })).toBeNull();
  });

  it('shows the slice’s matches before the server answers, with no busy line', async () => {
    await typeQuery({ [TOP]: [slice([STRUDEL], [C])], [SUGGEST]: [never] }, 'str');

    expect(screen.getByRole('button', { name: 'Strudel, Open' })).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Create/ })).toBeNull();
  });

  it('opens an open topic’s page and sends no request for it', async () => {
    const requests = await typeQuery({ [TOP]: [slice([STRUDEL])], [SUGGEST]: [suggested()] }, 's');
    fireEvent.press(screen.getByRole('button', { name: 'Strudel, Open' }));
    await advance(0);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
    expect(posts(requests)).toHaveLength(0);
  });

  it('opens a built catalog row’s topic', async () => {
    await typeQuery({ [TOP]: [slice([])], [SUGGEST]: [suggested(CLOJURE)] }, 'clo');
    fireEvent.press(screen.getByRole('button', { name: 'Clojure, code, Open' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'clojure' },
    });
  });
});

describe('Explore: building a catalog row', () => {
  it('requests the row with its catalog key, then shows its card', async () => {
    const requests = await typeQuery(
      {
        [TOP]: [slice([])],
        [SUGGEST]: [suggested(C)],
        'POST /topics': [
          json(202, { topic: { ...BUILDING_C, status: 'pending' }, job_id: 'job-1' }),
        ],
        'GET /jobs/job-1': [running],
      },
      'c',
    );
    fireEvent.press(screen.getByRole('button', { name: 'C (programming language), code, Build' }));
    await advance(0);

    expect(posts(requests).map((r) => r.body)).toStrictEqual([
      { query: 'C (programming language)', catalog_key: 'wikidata:Q15777' },
    ]);
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the page of a topic already being built (a 200 with no job)', async () => {
    await typeQuery(
      {
        [TOP]: [slice([])],
        [SUGGEST]: [suggested(C)],
        'POST /topics': [json(200, { topic: BUILDING_C, job_id: null })],
      },
      'c',
    );
    fireEvent.press(screen.getByRole('button', { name: 'C (programming language), code, Build' }));
    await advance(0);

    expect(router.push).toHaveBeenCalledWith({ pathname: '/topic/[slug]', params: { slug: 'c' } });
    expect(screen.queryByText('Building your tree')).toBeNull();
  });
});

describe('Explore: nothing matches', () => {
  it('offers Create with the text, under the catalog line, when nothing matches', async () => {
    await typeQuery({ [TOP]: [slice([STRUDEL], [C])], [SUGGEST]: [suggested()] }, ' zzqx ');

    const lines = screen.getAllByText(/^(Not in the catalog yet|Create zzqx)/);
    expect(lines.map((line) => line.props.children as string)).toStrictEqual([
      'Not in the catalog yet — you can still request it',
      'Create zzqx',
    ]);
    expect(screen.getByRole('button', { name: 'Create zzqx' })).toBeEnabled();
    expect(screen.queryByTestId('explore-row')).toBeNull();
  });

  it('keeps the slice’s rows when the suggestions fail, with no failure line', async () => {
    await typeQuery(
      { [TOP]: [slice([STRUDEL])], [SUGGEST]: [json(500, { detail: 'server text' })] },
      'str',
    );

    expect(screen.getByRole('button', { name: 'Strudel, Open' })).toBeOnTheScreen();
    expect(screen.queryByText('server text')).toBeNull();
    expect(screen.queryByText("Couldn't search topics.")).toBeNull();
    expect(screen.queryByText(/^Not in the catalog yet/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Create/ })).toBeNull();
  });

  it.each([
    { when: 'the suggestions are on their way', answer: never, shows: 'Searching…' },
    { when: 'the suggestions failed', answer: json(500, {}), shows: "Couldn't search topics." },
  ])('offers no Create while $when and nothing matches', async ({ answer, shows }) => {
    await typeQuery({ [TOP]: [slice([STRUDEL])], [SUGGEST]: [answer] }, 'zzqx');

    expect(screen.getAllByText(shows)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Create/ })).toBeNull();
    expect(screen.queryByTestId('explore-row')).toBeNull();
  });
});

describe('Explore: the list’s length', () => {
  it(`shows every open topic and at most ${String(EXPLORE_MAX_ROWS)} catalog rows`, async () => {
    const many = Array.from({ length: EXPLORE_MAX_ROWS + 5 }, (_, i) =>
      suggestion(`k${String(i)}`, `Cell ${String(i)}`, 'prose', null),
    );
    await typeQuery({ [TOP]: [slice([CPP_TOPIC, COOKING])], [SUGGEST]: [suggested(...many)] }, 'c');

    const labels = screen
      .getAllByTestId('explore-row')
      .map((r) => r.props.accessibilityLabel as string);
    expect(labels).toHaveLength(EXPLORE_MAX_ROWS + 2);
    expect(labels.slice(0, 2)).toStrictEqual(['C++, Open', 'Cooking, Open']);
    expect(labels.at(-1)).toBe(`Cell ${String(EXPLORE_MAX_ROWS - 1)}, prose, Build`);
  });
});
