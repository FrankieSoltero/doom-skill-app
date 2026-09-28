import { render, screen } from '@testing-library/react-native';

import { colors, fonts, type } from '../../theme';
import { BoldText } from '../BoldText';
import { textStyleOf } from '../testing/styles';

const BODY = 'Wrap steps in **< >** and play **one** per cycle.';
const SHOWN = 'Wrap steps in < > and play one per cycle.';

/** Every bold span, in order. */
function boldSpans() {
  return screen.queryAllByTestId('bold-span');
}

describe('BoldText', () => {
  it('renders one text whose content is the input with its paired markers removed', () => {
    render(<BoldText text={BODY} />);
    const outer = screen.getByText(SHOWN);

    expect(outer).toBeOnTheScreen();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    for (const span of boldSpans()) {
      expect(outer).toContainElement(span);
    }
  });

  it('draws the text between each pair of markers in the bold body font', () => {
    render(<BoldText text={BODY} />);
    const spans = boldSpans();

    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('< >', { exact: true });
    expect(spans[1]).toHaveTextContent('one', { exact: true });
    expect(spans.map((span) => textStyleOf(span))).toStrictEqual([
      { fontFamily: fonts.bodyBold },
      { fontFamily: fonts.bodyBold },
    ]);
  });

  it('applies the given style to the outer text, so the spans inherit it', () => {
    render(<BoldText text={BODY} style={[type.body, { color: colors.paper }]} />);

    expect(textStyleOf(screen.getByText(SHOWN))).toStrictEqual({
      ...type.body,
      color: colors.paper,
    });
  });

  it.each([
    ['an unpaired marker as typed', 'Use ** to mark', 'Use ** to mark'],
    ['text with no markers as given', 'A rest keeps its place.', 'A rest keeps its place.'],
    ['an empty pair as nothing', 'x****y', 'xy'],
  ])('shows %s, with nothing bold', (_case, text, shown) => {
    render(<BoldText text={text} />);

    expect(screen.getByText(shown)).toBeOnTheScreen();
    expect(boldSpans()).toHaveLength(0);
  });
});
