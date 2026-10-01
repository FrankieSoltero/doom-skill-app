// Test support for `useStrudel`: renders the hook with `renderHook`, and its `player` (the hidden
// WebView stand-in) in a second root, then drives it inside `act`. Not app code.
import { act, render, renderHook } from '@testing-library/react-native';

import { useStrudel, type PlayerOwner, type Strudel } from '../useStrudel';
import { pagePosts } from './webview';

/** Code for tests that do not care what is played. */
export const CODE = 's("bd sd")';

interface HookResult {
  current: Strudel;
}

/** The hook, with its player rendered, still waiting for the page; `owner` names its card. */
export function mountPlayer(owner?: PlayerOwner) {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useStrudel(owner);
  });
  const view = render(hook.result.current.player);
  /** Renders the hook's current player in place of the old one, as a screen would. */
  const renderPlayer = () => {
    view.rerender(hook.result.current.player);
  };
  return {
    result: hook.result,
    unmountHook: hook.unmount,
    unmountPlayer: view.unmount,
    renderPlayer,
    /** How many times the hook has rendered: one per state update it published. */
    renders: () => renders,
  };
}

/** Two hooks, each with its own player, rendered side by side: WebView 0 and WebView 1. */
export function mountTwoPlayers() {
  const first = renderHook(() => useStrudel());
  const second = renderHook(() => useStrudel());
  render(
    <>
      {first.result.current.player}
      {second.result.current.player}
    </>,
  );
  pagePosts({ type: 'ready' }, 0);
  pagePosts({ type: 'ready' }, 1);
  return { first, second };
}

/** A hook whose page has posted `ready`. */
export function readyPlayer() {
  const player = mountPlayer();
  pagePosts({ type: 'ready' });
  return player;
}

/** Calls the hook's `play` inside `act`. */
export function play(result: HookResult, code = CODE): void {
  act(() => {
    result.current.play(code);
  });
}

/** Calls one of the hook's actions that take no argument inside `act`. */
export function call(result: HookResult, action: 'stop' | 'clearError' | 'reset'): void {
  act(() => {
    result.current[action]();
  });
}

/** A ready hook that is playing `code`. */
export function playingPlayer(code = CODE) {
  const player = readyPlayer();
  play(player.result, code);
  return player;
}

/** Moves fake time on by `ms`, inside `act`. */
export function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}
