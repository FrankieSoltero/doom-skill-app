import { render, screen } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';

import { border, colors, space, type } from '../../theme';
import { Passage } from '../Passage';
import { textStyleOf, viewStyleOf } from '../testing/styles';

// A cloze sentence of the longest kind a card holds (at most 178 characters).
const SENTENCE =
  'Photosynthesis turns light, water and carbon dioxide into ___ and oxygen, and it takes ' +
  'place in the chloroplasts of the green cells of a leaf, mostly in the palisade layer.';
const SPOKEN = SENTENCE.replace('___', 'blank');
const BOLD_MARKS = 'Plain text keeps **these marks** as typed.';

/** Matches the whole text of an element exactly, keeping spaces. */
const exact = { normalizer: (text: string) => text };

describe('Passage', () => {
  it('draws the text in the body style, in ink', () => {
    render(<Passage text={SENTENCE} />);
    const text = screen.getByTestId('passage-text');

    expect(screen.getByText(SENTENCE, exact)).toBe(text);
    expect(textStyleOf(text)).toStrictEqual({ ...type.body, color: colors.ink });
  });

  it('draws a paper block with an ink left border and theme spacing', () => {
    render(<Passage text={SENTENCE} />);

    expect(viewStyleOf(screen.getByTestId('passage'))).toStrictEqual({
      backgroundColor: colors.paper,
      borderLeftWidth: border.strong,
      borderLeftColor: colors.ink,
      paddingVertical: space[3],
      paddingHorizontal: space[4],
    });
  });

  it('wraps the text: no scroll view, no fixed width, no line limit', () => {
    render(<Passage text={SENTENCE} />);
    const text = screen.getByTestId('passage-text');

    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    expect(viewStyleOf(screen.getByTestId('passage'))).not.toHaveProperty('width');
    expect(textStyleOf(text)).not.toHaveProperty('width');
    expect(text.props).not.toHaveProperty('numberOfLines');
  });

  it('draws bold marks as plain characters, in one text with no bold span', () => {
    render(<Passage text={BOLD_MARKS} />);
    const [text, ...others] = screen.UNSAFE_queryAllByType(Text);

    expect(others).toHaveLength(0);
    expect(screen.getByText(BOLD_MARKS, exact)).toBe(screen.getByTestId('passage-text'));
    expect(text?.props.children).toBe(BOLD_MARKS);
    expect(textStyleOf(screen.getByTestId('passage-text')).fontFamily).toBe(type.body.fontFamily);
  });

  it('is read as its text when given no spoken label', () => {
    render(<Passage text={SENTENCE} />);

    expect(screen.getByTestId('passage-text').props.accessibilityLabel).toBeUndefined();
  });

  it('is read as the spoken label when given one, and still draws its text', () => {
    render(<Passage text={SENTENCE} spokenLabel={SPOKEN} />);
    const text = screen.getByTestId('passage-text');

    expect(text.props.accessibilityLabel).toBe(SPOKEN);
    expect(screen.getByText(SENTENCE, exact)).toBe(text);
  });
});
