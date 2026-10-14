// The card's notice (card quality loop Task 8, spec section 4): a card a learner flagged, or one
// being rebuilt, says so in one line under its kicker, in the card's text colour.
import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CardFrame } from '../../components/CardFrame';
import { textStyleOf } from '../../components/testing/styles';
import { copy } from '../../copy';
import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors } from '../../theme';
import { CardNotice } from '../CardNotice';
import { SourcesTarget } from '../cardSources';

const KICKER = 'Quiz · Mini-notation';
const NOTICE_LINES = [copy.card.noticeRebuilding, copy.card.noticeFlagged];

/** A frame holding `card` (the feed's way), with an optional `notice` prop on the frame. */
function renderFrame(card: Card | null, frameProps: { notice?: 'flagged' | null } = {}) {
  const frame = (
    <CardFrame type="quiz" kicker={KICKER} {...frameProps}>
      <Text>body</Text>
    </CardFrame>
  );
  render(card === null ? frame : <SourcesTarget card={card}>{frame}</SourcesTarget>);
}

function expectNoNotice() {
  for (const line of NOTICE_LINES) expect(screen.queryByText(line)).toBeNull();
}

describe('CardNotice', () => {
  it.each([
    ['rebuilding', copy.card.noticeRebuilding],
    ['flagged', copy.card.noticeFlagged],
  ] as const)('says %s in one ink text line', (notice, line) => {
    render(<CardNotice notice={notice} />);
    const text = screen.getByText(line);

    expect(text.props).toMatchObject({ accessibilityRole: 'text' });
    expect(textStyleOf(text).color).toBe(colors.ink);
  });

  it('draws nothing for a clean card', () => {
    const { toJSON } = render(<CardNotice notice={null} />);

    expect(toJSON()).toBeNull();
  });

  it('reads the two lines from copy, as the constraints give them', () => {
    expect(copy.card.noticeRebuilding).toBe("This card may be off; it's being rebuilt");
    expect(copy.card.noticeFlagged).toBe('This card was flagged');
  });
});

describe('CardFrame notice', () => {
  it('draws the notice of the card it holds after the kicker row, before the content', () => {
    renderFrame({ ...cardsByType.quiz, notice: 'rebuilding' });
    const body = screen.getByTestId('card-frame-body');
    const texts = within(body)
      .getAllByText(/.+/)
      .map((element) => element.props.children as unknown);

    expect(texts).toStrictEqual([KICKER, copy.card.noticeRebuilding, 'body']);
    expect(
      within(screen.getByTestId('card-kicker-row')).queryByText(copy.card.noticeRebuilding),
    ).toBeNull();
  });

  it('draws it in the card text colour, so it reads on an ink-ground card', () => {
    render(
      <CardFrame type="exercise" kicker={KICKER} notice="flagged">
        <Text>body</Text>
      </CardFrame>,
    );

    expect(textStyleOf(screen.getByText(copy.card.noticeFlagged)).color).toBe(
      cardTheme.exercise.fg,
    );
  });

  it('takes a notice prop over the card it holds', () => {
    renderFrame({ ...cardsByType.quiz, notice: 'rebuilding' }, { notice: null });

    expectNoNotice();
  });

  it('draws the prop notice on a frame that holds no card', () => {
    renderFrame(null, { notice: 'flagged' });

    expect(screen.getByText(copy.card.noticeFlagged)).toBeOnTheScreen();
  });

  it.each([
    ['a clean card', { ...cardsByType.quiz, notice: null }],
    ['a demo card, which has no notice key', cardsByType.quiz],
    ['the checkpoint, which has no notice key', cardsByType.checkpoint],
  ])('draws no notice for %s, and adds no child to the body', (_name, card: Card) => {
    renderFrame(card);

    expectNoNotice();
    // The kicker row and the content: the children a card's height budget counts.
    expect(screen.getByTestId('card-frame-body').children).toHaveLength(2);
  });

  it('draws no notice on a frame that holds no card (the Summary)', () => {
    renderFrame(null);

    expectNoNotice();
  });
});
