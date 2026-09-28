/**
 * Test support: a stand-in for `useStrudel`, so a card test sets each audio state directly. The
 * test file replaces the hook with a mock and points it here:
 *
 *   jest.mock('../../strudel/useStrudel', () => ({
 *     ...jest.requireActual<object>('../../strudel/useStrudel'),
 *     useStrudel: jest.fn(),
 *   }));
 *   beforeEach(() => { jest.mocked(useStrudel).mockImplementation(useStrudelDouble); });
 *
 * The actions are `jest.fn`s that change the state as the real hook would. The `player` is one
 * element for the whole test file that counts its mounts. It lives outside `__tests__/` because
 * Jest runs every file there as a suite.
 */
import { act } from '@testing-library/react-native';
import { createElement, useEffect } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

import type { Strudel } from '../../strudel/useStrudel';

type AudioState = Pick<Strudel, 'status' | 'playing' | 'step' | 'error' | 'needsNetwork'>;

/** A player whose page is ready and which is not playing. */
const READY: AudioState = {
  status: 'ready',
  playing: false,
  step: null,
  error: null,
  needsNetwork: false,
};

const audio = create<AudioState>(() => READY);

let playerMounts = 0;

/** Stands in for the hidden WebView and counts how often it mounts. */
function PlayerDouble() {
  useEffect(() => {
    playerMounts += 1;
  }, []);
  return <View testID="strudel-player" />;
}

const player = createElement(PlayerDouble);

/** The double's actions: each records its calls and changes the state as the real hook does. */
export const strudelActions = {
  play: jest.fn<undefined, [string]>(() => {
    audio.setState({ playing: true, step: null, error: null, needsNetwork: false });
  }),
  stop: jest.fn<undefined, []>(() => {
    audio.setState({ playing: false, step: null });
  }),
  clearError: jest.fn<undefined, []>(() => {
    audio.setState({ error: null });
  }),
  reset: jest.fn<undefined, []>(() => {
    audio.setState({ ...READY, status: 'starting' });
  }),
};

/** The stand-in hook: the double's state, its actions and its player. */
export function useStrudelDouble(): Strudel {
  return { ...audio(), ...strudelActions, player };
}

/** Puts the double back to ready and quiet, with no calls and no player mounts. */
export function resetStrudelDouble(): void {
  audio.setState(READY, true);
  playerMounts = 0;
  Object.values(strudelActions).forEach((action) => action.mockClear());
}

/** Changes the double's state, as the hook would publish it, inside `act`. */
export function setAudio(change: Partial<AudioState>): void {
  act(() => {
    audio.setState(change);
  });
}

/** How many times the player element has mounted since the last reset. */
export function playerMountCount(): number {
  return playerMounts;
}
