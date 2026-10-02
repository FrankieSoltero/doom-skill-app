// The concept card's autoplay starts only while the card is shown (M9 plan I final fix): its page
// is the current one, its screen is focused and the app is not in the background. A visit is a
// period of being shown; leaving the screen or sending the app to the background ends it, so the
// next return plays again. The player is the Strudel test double; the screens are Expo Router's.
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { renderRouter } from 'expo-router/testing-library';
import { AppState, Text } from 'react-native';

import { useStrudel } from '../../strudel/useStrudel';
import { appBecomes, appIsAlready, restoreAppState } from '../testing/appState';
import {
  resetStrudelDouble,
  setAudio,
  strudelActions,
  useStrudelDouble,
} from '../testing/strudelDouble';
import { usePlayableCode } from '../usePlayableCode';

const CODE = 's("bd ~ sd ~")';
const OWNER = { cardIndex: 0 };
const { play, stop } = strudelActions;

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

/**
 * Draws an active card that plays CODE on the index tab, with every tab mounted at once
 * (`lazy: false`), so the card mounts unfocused when `initialUrl` is the other tab.
 */
function renderInTabs(initialUrl: '/' | '/other', autoplay: boolean): void {
  function Card() {
    usePlayableCode({ code: CODE, owner: OWNER, active: true, autoplay });
    return <Text>card</Text>;
  }
  renderRouter(
    {
      _layout: () => <Tabs screenOptions={{ lazy: false }} />,
      index: Card,
      other: () => <Text>other</Text>,
    },
    { initialUrl },
  );
}

/** Shows the screen at `url`, as a tab tap or a back gesture does. */
function goTo(url: '/' | '/other'): void {
  act(() => {
    router.navigate(url);
  });
}

/** The hook for an active card outside a navigator, where only the app state can hide it. */
function renderActive(autoplay: boolean): void {
  renderHook(() => usePlayableCode({ code: CODE, owner: OWNER, active: true, autoplay }));
}

beforeEach(() => {
  resetStrudelDouble();
  jest.mocked(useStrudel).mockClear().mockImplementation(useStrudelDouble);
  jest.mocked(AppState).addEventListener.mockClear();
});

afterEach(() => {
  restoreAppState();
});

describe('usePlayableCode autoplay: the screen', () => {
  it('does not play while its screen is not focused, and plays once when it gains focus', () => {
    setAudio({ status: 'starting' });
    renderInTabs('/other', true);
    setAudio({ status: 'ready' });
    expect(play).not.toHaveBeenCalled();

    goTo('/');
    setAudio({ step: 2 });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
  });

  it('plays again when its screen loses focus and gains it again: a new visit', () => {
    renderInTabs('/', true);
    expect(play).toHaveBeenCalledTimes(1);

    goTo('/other');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    goTo('/');

    expect(play.mock.calls).toStrictEqual([[CODE], [CODE]]);
  });
});

describe('usePlayableCode autoplay: the app state', () => {
  it('does not play while the app is in the background, and plays once when it is back', () => {
    setAudio({ status: 'starting' });
    renderActive(true);
    appBecomes('background');
    setAudio({ status: 'ready' });
    expect(play).not.toHaveBeenCalled();

    appBecomes('active');
    setAudio({ step: 1 });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
  });

  it('does not play when drawn while the app is in the background', () => {
    appIsAlready('background');
    renderActive(true);
    expect(play).not.toHaveBeenCalled();

    appBecomes('active');

    expect(play.mock.calls).toStrictEqual([[CODE]]);
  });

  it('plays again after a return from the background: a new visit', () => {
    renderActive(true);

    appBecomes('background');
    appBecomes('active');

    expect(play.mock.calls).toStrictEqual([[CODE], [CODE]]);
  });

  it('neither stops nor plays again when the app is only inactive', () => {
    renderActive(true);

    appBecomes('inactive');
    appBecomes('active');

    expect(play.mock.calls).toStrictEqual([[CODE]]);
    expect(stop).not.toHaveBeenCalled();
  });
});

describe('usePlayableCode without autoplay', () => {
  it('never plays on a change of focus', () => {
    setAudio({ status: 'starting' });
    renderInTabs('/other', false);
    setAudio({ status: 'ready' });

    goTo('/');
    goTo('/other');
    goTo('/');

    expect(play).not.toHaveBeenCalled();
  });

  it('never plays on a change of app state', () => {
    appIsAlready('background');
    renderActive(false);

    appBecomes('active');
    appBecomes('background');
    appBecomes('inactive');
    appBecomes('active');

    expect(play).not.toHaveBeenCalled();
  });
});
