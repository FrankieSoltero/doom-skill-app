import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { border, cardTheme, colors, fonts, hardShadow, type } from '../../theme';
import { RatingRow } from '../RatingRow';
import type { Rating } from '../RatingRow';

/** The demo card's ratings, README.md:119. */
const FOUR: [string, string][] = [
  ['Again', '<1 min'],
  ['Hard', '2 days'],
  ['Good', '4 days'],
  ['Easy', '9 days'],
];

/** Pressability's responder event fields; with no `touches` it reads the position from here. */
const TOUCH = {
  persist: () => undefined,
  currentTarget: { measure: () => undefined },
  nativeEvent: { pageX: 0, pageY: 0 },
};

/** A pressed button's offset, README.md:18 and prototype line 204. */
const PRESSED = { transform: [{ translateX: 2 }, { translateY: 2 }] };

function renderRow(rating: Rating | null = null, ratings: [string, string][] = FOUR) {
  const onRate = jest.fn<undefined, [Rating]>();
  render(<RatingRow ratings={ratings} rating={rating} onRate={onRate} />);
  return onRate;
}

const buttons = () => within(screen.getByTestId('rating-buttons')).getAllByRole('button');
const faces = () => screen.getAllByTestId('rating-face');
const shadows = () => screen.queryAllByTestId('rating-shadow');

/** The picked accessibility state of each button (see docs/mistakes-and-fixes.md on Pressable). */
function statesOf() {
  return buttons().map((button) => {
    const { selected, disabled } = button.props.accessibilityState as {
      selected?: boolean;
      disabled?: boolean;
    };
    return { selected, disabled };
  });
}

afterEach(() => {
  jest.useRealTimers();
});

describe('RatingRow content', () => {
  it('shows the caption, then each label over its interval, in order', () => {
    renderRow();

    expect(textStyleOf(screen.getByText('How well did you remember?'))).toStrictEqual({
      ...type.caption,
      color: colors.ink,
    });
    const texts = within(screen.getByTestId('rating-buttons'))
      .getAllByText(/./)
      .map((text) => String(text.props.children));
    expect(texts).toStrictEqual(FOUR.flat());
  });

  it('shows two ratings in two equal columns when the card gives two', () => {
    renderRow(null, FOUR.slice(0, 2));

    expect(buttons()).toHaveLength(2);
    for (const cell of screen.getAllByTestId('rating-cell')) {
      expect(viewStyleOf(cell)).toStrictEqual({ flex: 1 });
    }
  });

  it('shows only the first four ratings when the card gives more', () => {
    renderRow(null, [...FOUR, ['Later', '30 days']]);

    expect(buttons()).toHaveLength(4);
    expect(screen.queryByText('Later')).toBeNull();
  });

  it('lays the buttons out in a row of equal columns 6 apart, 6 under the caption', () => {
    renderRow();

    expect(viewStyleOf(screen.getByTestId('rating-row'))).toStrictEqual({ gap: 6 });
    expect(viewStyleOf(screen.getByTestId('rating-buttons'))).toStrictEqual({
      flexDirection: 'row',
      gap: 6,
    });
    expect(screen.getAllByTestId('rating-cell')).toHaveLength(4);
  });
});

describe('RatingRow looks', () => {
  it('before a rating: paper faces 60 tall with a 1.5 ink border and a 2 point ink shadow', () => {
    renderRow();

    for (const face of faces()) {
      expect(viewStyleOf(face)).toMatchObject({
        height: 60,
        borderWidth: border.strong,
        borderColor: colors.ink,
        backgroundColor: colors.paper,
      });
    }
    expect(shadows()).toHaveLength(4);
    for (const shadow of shadows()) {
      expect(viewStyleOf(shadow)).toStrictEqual({
        position: 'absolute',
        top: hardShadow.small,
        left: hardShadow.small,
        right: -hardShadow.small,
        bottom: -hardShadow.small,
        backgroundColor: colors.ink,
      });
    }
  });

  it('sets the label in the 17 point heading and the interval in the 11 point body, ink', () => {
    renderRow();

    expect(textStyleOf(screen.getByText('Good'))).toMatchObject({
      fontFamily: fonts.heading,
      fontSize: 17,
      color: colors.ink,
    });
    expect(textStyleOf(screen.getByText('4 days'))).toMatchObject({
      fontFamily: fonts.body,
      fontSize: 11,
      color: colors.ink,
    });
  });

  it('once rated: the rating is ink with yellow text, the rest stay paper, no shadows', () => {
    renderRow(2);

    const fills = faces().map((face) => viewStyleOf(face).backgroundColor);
    expect(fills).toStrictEqual([colors.paper, colors.paper, colors.ink, colors.paper]);
    expect(textStyleOf(screen.getByText('Good')).color).toBe(cardTheme.review.bg);
    expect(textStyleOf(screen.getByText('4 days')).color).toBe(cardTheme.review.bg);
    expect(textStyleOf(screen.getByText('Easy')).color).toBe(colors.ink);
    expect(shadows()).toHaveLength(0);
  });

  it('moves 2 points right and down and drops its shadow while pressed', () => {
    jest.useFakeTimers();
    const onRate = renderRow();
    const [, hard] = buttons();
    if (hard === undefined) throw new Error('no Hard button');

    fireEvent(hard, 'responderGrant', TOUCH);
    expect(hard).toHaveStyle(PRESSED);
    expect(shadows()).toHaveLength(3);

    fireEvent(hard, 'responderRelease', TOUCH);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(hard).not.toHaveStyle(PRESSED);
    expect(shadows()).toHaveLength(4);
    expect(onRate.mock.calls).toStrictEqual([[1]]);
  });
});

describe('RatingRow behavior and accessibility', () => {
  it.each([0, 1, 2, 3] as const)('calls onRate once with position %i', (position) => {
    const onRate = renderRow();

    fireEvent.press(screen.getByText(FOUR[position]?.[0] ?? ''));

    expect(onRate.mock.calls).toStrictEqual([[position]]);
  });

  it('once rated, every button is disabled and a press does nothing', () => {
    const onRate = renderRow(0);

    for (const button of buttons()) {
      fireEvent.press(button);
      expect(button).toBeDisabled();
    }

    expect(onRate).not.toHaveBeenCalled();
  });

  it('speaks each button as its label and interval, with its selected and disabled state', () => {
    renderRow(3);

    expect(buttons().map((button) => String(button.props.accessibilityLabel))).toStrictEqual([
      'Again, next review in <1 min',
      'Hard, next review in 2 days',
      'Good, next review in 4 days',
      'Easy, next review in 9 days',
    ]);
    expect(statesOf()).toStrictEqual([
      { selected: false, disabled: true },
      { selected: false, disabled: true },
      { selected: false, disabled: true },
      { selected: true, disabled: true },
    ]);
  });

  it('before a rating, says every button is enabled and none selected', () => {
    renderRow();

    expect(statesOf()).toStrictEqual(
      Array.from({ length: 4 }, () => ({ selected: false, disabled: false })),
    );
  });
});
