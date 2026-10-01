import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { CardFrame } from '../../components/CardFrame';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { border, colors, fonts } from '../../theme';
import { ExerciseControls } from '../ExerciseControls';
import { holdDown, letGo } from '../testing/press';

const HIDDEN = { includeHiddenElements: true };

type Options = { playing?: boolean; canPlay?: boolean };

/** Draws the controls in the exercise card's frame and returns their callbacks. */
function renderControls({ playing = false, canPlay = true }: Options = {}) {
  const calls = {
    onPlay: jest.fn<undefined, []>(),
    onStop: jest.fn<undefined, []>(),
    onCheck: jest.fn<undefined, []>(),
  };
  render(
    <CardFrame type="exercise" kicker="Exercise · REPL">
      <ExerciseControls playing={playing} canPlay={canPlay} {...calls} />
    </CardFrame>,
  );
  return calls;
}

const button = (name: string) => screen.getByRole('button', { name });
const disabledOf = (name: string): unknown =>
  (button(name).props.accessibilityState as { disabled?: boolean }).disabled;

afterEach(() => {
  jest.useRealTimers();
});

describe('ExerciseControls layout', () => {
  it('puts Play and Check side by side, 8 apart, each 46 tall and half the row', () => {
    renderControls();

    expect(viewStyleOf(screen.getByTestId('exercise-controls'))).toStrictEqual({
      flexDirection: 'row',
      gap: 8,
    });
    for (const name of ['Play', 'Check']) {
      expect(viewStyleOf(button(name))).toMatchObject({
        flex: 1,
        height: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      });
    }
  });

  it('fills Play with lime and writes it in 17 point ink heading text', () => {
    renderControls();

    expect(viewStyleOf(button('Play')).backgroundColor).toBe(colors.lime);
    expect(textStyleOf(within(button('Play')).getByText('Play'))).toStrictEqual({
      fontFamily: fonts.heading,
      fontSize: 17,
      color: colors.ink,
    });
  });

  it('leaves Check transparent, in paper text, with a paper border at 45% that holds nothing', () => {
    renderControls();

    const check = button('Check');
    expect(viewStyleOf(check).backgroundColor).toBeUndefined();
    expect(textStyleOf(within(check).getByText('Check'))).toMatchObject({ color: colors.paper });
    const edge = within(check).getByTestId('faded-border');
    expect(viewStyleOf(edge)).toStrictEqual({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderWidth: border.hairline,
      borderColor: colors.paper,
      opacity: 0.45,
    });
    expect(edge.children).toHaveLength(0);
    expect(edge.props).toHaveProperty('pointerEvents', 'none');
  });

  it('shows a 16 point filled Play icon, hidden from screen readers', () => {
    renderControls();

    const icon = within(button('Play')).getByTestId('play-icon', HIDDEN);
    expect(icon.props).toMatchObject({
      width: 16,
      height: 16,
      stroke: colors.ink,
      fill: colors.ink,
      strokeWidth: 1.5,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('ExerciseControls behavior', () => {
  it('calls onPlay from Play and onCheck from Check', () => {
    const calls = renderControls();

    fireEvent.press(button('Play'));
    fireEvent.press(button('Check'));

    expect(calls.onPlay).toHaveBeenCalledTimes(1);
    expect(calls.onCheck).toHaveBeenCalledTimes(1);
    expect(calls.onStop).not.toHaveBeenCalled();
  });

  it('shows Stop with a Square icon while playing, which calls onStop', () => {
    const calls = renderControls({ playing: true });

    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(within(button('Stop')).getByText('Stop')).toBeOnTheScreen();
    expect(within(button('Stop')).getByTestId('stop-icon', HIDDEN)).toBeOnTheScreen();
    fireEvent.press(button('Stop'));

    expect(calls.onStop).toHaveBeenCalledTimes(1);
    expect(calls.onPlay).not.toHaveBeenCalled();
  });

  it('disables Play when it cannot play: 45% opacity, reported, and a press does nothing', () => {
    const calls = renderControls({ canPlay: false });

    fireEvent.press(button('Play'));

    expect(calls.onPlay).not.toHaveBeenCalled();
    expect(disabledOf('Play')).toBe(true);
    expect(viewStyleOf(button('Play')).opacity).toBe(0.45);
    expect(disabledOf('Check')).toBe(false);
  });

  it('keeps Stop enabled while playing even when a new play is not allowed', () => {
    const calls = renderControls({ playing: true, canPlay: false });

    fireEvent.press(button('Stop'));

    expect(calls.onStop).toHaveBeenCalledTimes(1);
    expect(disabledOf('Stop')).toBe(false);
  });

  it.each(['Play', 'Check'])('moves %s 1 point right and down while pressed', (name) => {
    jest.useFakeTimers();
    renderControls();

    holdDown(button(name));
    expect(viewStyleOf(button(name)).transform).toStrictEqual([
      { translateX: 1 },
      { translateY: 1 },
    ]);

    letGo(button(name));
    expect(viewStyleOf(button(name)).transform).toBeUndefined();
  });
});

describe('ExerciseControls with no Play (an exercise the app checks but cannot play)', () => {
  it('shows Check alone across the row, with no Play icon, and calls onCheck', () => {
    const onCheck = jest.fn<undefined, []>();
    render(
      <CardFrame type="exercise" kicker="Exercise · Window functions">
        <ExerciseControls onCheck={onCheck} />
      </CardFrame>,
    );

    const row = screen.getByTestId('exercise-controls');
    expect(within(row).getAllByRole('button')).toStrictEqual([button('Check')]);
    expect(viewStyleOf(button('Check'))).toMatchObject({ flex: 1, height: 46 });
    expect(screen.queryByTestId('play-icon', HIDDEN)).toBeNull();
    fireEvent.press(button('Check'));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
