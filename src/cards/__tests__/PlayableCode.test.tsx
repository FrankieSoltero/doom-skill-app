// A code block that plays (M9 plan I Task 3): the code with a Play / Stop control on its row, the
// audio notice in place of what is drawn under it while the audio needs attention, and the hidden
// player rendered once. The player is the Strudel test double, except where two real hooks show
// that starting one stops the other.
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { viewStyleOf } from '../../components/testing/styles';
import { pagePosts, sentToPage } from '../../strudel/testing/webview';
import { useStrudel } from '../../strudel/useStrudel';
import { PlayableCode } from '../PlayableCode';
import {
  playerMountCount,
  resetStrudelDouble,
  setAudio,
  strudelActions,
  useStrudelDouble,
} from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const CODE = 's("bd sd")';
const HIDDEN = { includeHiddenElements: true };
const { play, stop, reset, clearError } = strudelActions;

/** The block for CODE with a comment, at page 1, active but not autoplaying, over a text. */
function renderBlock() {
  render(
    <PlayableCode
      code={CODE}
      comment="// two steps"
      owner={{ cardIndex: 1 }}
      active
      autoplay={false}
    >
      <Text testID="under-code">under</Text>
    </PlayableCode>,
  );
}

function control(name: 'Play' | 'Stop') {
  return screen.getByRole('button', { name });
}

function isDisabled(name: 'Play' | 'Stop'): unknown {
  const { disabled } = control(name).props.accessibilityState as { disabled?: boolean };
  return disabled;
}

beforeEach(() => {
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('PlayableCode drawing', () => {
  it('draws the code and its comment, with the control on the code block row', () => {
    renderBlock();
    const row = screen.getByTestId('playable-code-row');

    expect(within(row).getByTestId('code-block-code')).toHaveTextContent(CODE);
    expect(within(row).getByTestId('code-block-comment')).toHaveTextContent('// two steps');
    expect(within(row).getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(viewStyleOf(row)).toMatchObject({ flexDirection: 'row' });
    expect(screen.getByTestId('under-code')).toBeOnTheScreen();
  });

  it('renders the player exactly once, and never remounts it', () => {
    renderBlock();

    fireEvent.press(control('Play'));
    setAudio({ status: 'unavailable', playing: false });
    fireEvent.press(screen.getByRole('button', { name: 'Reset audio' }));

    expect(screen.getAllByTestId('strudel-player', HIDDEN)).toHaveLength(1);
    expect(playerMountCount()).toBe(1);
  });
});

describe('PlayableCode control', () => {
  it('plays the code, then shows Stop, which stops', () => {
    renderBlock();

    fireEvent.press(control('Play'));
    expect(play.mock.calls).toStrictEqual([[CODE]]);
    fireEvent.press(control('Stop'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(control('Play')).toBeOnTheScreen();
  });

  it.each([
    ['the player is starting', { status: 'starting' as const }],
    ['the player is unavailable', { status: 'unavailable' as const }],
    ['there is an audio error', { error: 'boom' }],
  ])('disables Play when %s', (_name, audio) => {
    renderBlock();
    setAudio(audio);

    fireEvent.press(control('Play'));

    expect(isDisabled('Play')).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it('keeps Stop enabled while playing', () => {
    renderBlock();
    setAudio({ playing: true });

    expect(isDisabled('Stop')).toBe(false);
  });
});

describe('PlayableCode audio notice', () => {
  it('shows the notice in place of what is under the code, and resets from it', () => {
    renderBlock();
    setAudio({ status: 'unavailable' });

    expect(screen.getByTestId('audio-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('under-code')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Reset audio' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(clearError).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      clearError.mock.invocationCallOrder[0] ?? 0,
    );
    expect(screen.queryByTestId('audio-notice')).toBeNull();
    expect(screen.getByTestId('under-code')).toBeOnTheScreen();
  });

  it.each([
    ['an audio error', { error: 'boom' }, 'Audio error'],
    ['playing without samples', { playing: true, needsNetwork: true }, 'Audio needs a connection'],
  ])('shows the notice for %s', (_name, audio, label) => {
    renderBlock();

    setAudio(audio);

    expect(screen.getByTestId('result-badge-label')).toHaveTextContent(label);
    expect(screen.queryByTestId('under-code')).toBeNull();
  });
});

describe('PlayableCode with the real useStrudel', () => {
  it('starting one block stops the other', () => {
    const actual = jest.requireActual<{ useStrudel: typeof useStrudel }>(
      '../../strudel/useStrudel',
    );
    jest.mocked(useStrudel).mockImplementation(actual.useStrudel);
    render(
      <>
        <PlayableCode code={CODE} owner={{ cardIndex: 0 }} active autoplay />
        <PlayableCode code='s("hh*4")' owner={{ cardIndex: 1 }} active={false} autoplay={false} />
      </>,
    );
    pagePosts({ type: 'ready' }, 0);
    pagePosts({ type: 'ready' }, 1);
    expect(sentToPage(0)).toStrictEqual([{ type: 'load', code: CODE }, { type: 'play' }]);

    fireEvent.press(control('Play'));

    expect(sentToPage(1)).toStrictEqual([{ type: 'load', code: 's("hh*4")' }, { type: 'play' }]);
    expect(sentToPage(0).at(-1)).toStrictEqual({ type: 'stop' });
    expect(control('Play')).toBeOnTheScreen();
    expect(control('Stop')).toBeOnTheScreen();
  });
});
