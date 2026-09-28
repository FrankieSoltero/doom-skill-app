import { registerPlayer, stopOtherPlayers } from '../playerRegistry';
import { CODE, mountTwoPlayers, play } from '../testing/player';
import { sentToPage } from '../testing/webview';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('playerRegistry', () => {
  it('stops every registered player but the one starting', () => {
    const [first, starting, last] = [jest.fn(), jest.fn(), jest.fn()];
    const unregister = [first, starting, last].map((stop) => registerPlayer(stop));
    stopOtherPlayers(starting);
    expect([first, starting, last].map((stop) => stop.mock.calls.length)).toStrictEqual([1, 0, 1]);
    for (const remove of unregister) {
      remove();
    }
  });

  it('forgets a player once it unregisters', () => {
    const gone = jest.fn();
    const staying = jest.fn();
    const removeGone = registerPlayer(gone);
    const removeStaying = registerPlayer(staying);
    removeGone();
    stopOtherPlayers(jest.fn());
    expect(gone).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledTimes(1);
    removeStaying();
  });
});

describe('useStrudel with two players', () => {
  it('stops the other player when one starts', () => {
    const { first, second } = mountTwoPlayers();
    play(first.result);
    play(second.result);
    expect([first.result.current.playing, second.result.current.playing]).toStrictEqual([
      false,
      true,
    ]);
    expect(sentToPage(0)).toStrictEqual([
      { type: 'load', code: CODE },
      { type: 'play' },
      { type: 'stop' },
    ]);
    expect(sentToPage(1)).toStrictEqual([{ type: 'load', code: CODE }, { type: 'play' }]);
  });

  it('sends nothing to a player that is not playing, or that has unmounted', () => {
    const { first, second } = mountTwoPlayers();
    play(second.result);
    expect(sentToPage(0)).toStrictEqual([]);
    second.unmount();
    const sentToSecond = sentToPage(1).length;
    play(first.result);
    expect(sentToPage(1)).toHaveLength(sentToSecond);
    expect(first.result.current.playing).toBe(true);
  });
});
