import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { renderRouter, screen } from 'expo-router/testing-library';
import { AppState, Text } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { useStopWhenAway } from '../useStopWhenAway';

const appState = jest.mocked(AppState);

beforeEach(() => {
  // React Native's Jest preset makes `AppState.addEventListener` a `jest.fn` already; clear it.
  appState.addEventListener.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Renders the hook with `active`, and returns its `stop` and a way to change `active`. */
function renderAway(active: boolean) {
  const stop = jest.fn<undefined, []>();
  const hook = renderHook(
    (props: { active: boolean }) => {
      useStopWhenAway({ ...props, stop });
    },
    { initialProps: { active } },
  );
  const setActive = (next: boolean) => {
    hook.rerender({ active: next });
  };
  return { stop, setActive, unmount: hook.unmount };
}

/** The app state listener the hook added, and the subscription it returned. */
function appStateListener() {
  const [call] = appState.addEventListener.mock.calls;
  const [result] = appState.addEventListener.mock.results;
  if (call === undefined || result === undefined) throw new Error('no app state listener');
  const [event, listener] = call;
  const subscription = result.value as { remove: jest.Mock };
  return {
    event,
    send: (state: AppStateStatus) => {
      act(() => {
        listener(state);
      });
    },
    subscription,
  };
}

describe('useStopWhenAway: the current page', () => {
  it('does not stop while the card is the current page', () => {
    const { stop } = renderAway(true);

    expect(stop).not.toHaveBeenCalled();
  });

  it('stops when the card stops being the current page, and not again on its return', () => {
    const { stop, setActive } = renderAway(true);

    setActive(false);
    expect(stop).toHaveBeenCalledTimes(1);

    setActive(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops a card drawn off the current page', () => {
    const { stop } = renderAway(false);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('useStopWhenAway: the app state', () => {
  it.each<AppStateStatus>(['background', 'inactive'])('stops when the app turns %s', (state) => {
    const { stop } = renderAway(true);
    const listener = appStateListener();

    listener.send(state);

    expect(listener.event).toBe('change');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop when the app turns active', () => {
    const { stop } = renderAway(true);

    appStateListener().send('active');

    expect(stop).not.toHaveBeenCalled();
  });

  it('removes its app state listener when it unmounts', () => {
    const { unmount } = renderAway(true);
    const { subscription } = appStateListener();

    unmount();

    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });
});

describe('useStopWhenAway: the screen', () => {
  it('works outside a navigator, where no screen can lose focus', () => {
    expect(() => renderAway(true)).not.toThrow();
  });

  it('stops when its screen loses focus to another tab, and each time it does', () => {
    const stop = jest.fn<undefined, []>();
    function Card() {
      useStopWhenAway({ active: true, stop });
      return <Text>card</Text>;
    }
    renderRouter(
      { _layout: () => <Tabs />, index: Card, other: () => <Text>other</Text> },
      { initialUrl: '/' },
    );
    expect(screen.getByText('card')).toBeOnTheScreen();
    expect(stop).not.toHaveBeenCalled();

    act(() => {
      router.navigate('/other');
    });
    expect(stop).toHaveBeenCalledTimes(1);

    act(() => {
      router.navigate('/');
    });
    expect(stop).toHaveBeenCalledTimes(1);

    act(() => {
      router.navigate('/other');
    });
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
