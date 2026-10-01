// The concept card of a topic without Strudel (M6 hardening Task 8): the code block shows only
// with a snippet, the cycle tiles only with a snippet and cycles, and the layout is otherwise the
// demo card's (ConceptCard.test.tsx), with the spacer keeping Got it at the bottom.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { viewStyleOf } from '../../components/testing/styles';
import type { ConceptCard as ConceptCardData } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { ConceptCard } from '../ConceptCard';

const { snippet, snippetComment, cycles, ...plain } = cardsByType.concept;
const PLAIN: ConceptCardData = {
  ...plain,
  title: 'Rank rows within a group',
  body: '**rank()** numbers the rows of each partition, with gaps after ties.',
};
const QUERY = 'SELECT rank() OVER (PARTITION BY depname ORDER BY salary DESC) FROM empsalary;';

function renderCard(card: ConceptCardData, active = true) {
  const onNext = jest.fn<undefined, []>();
  render(<ConceptCard card={card} active={active} onNext={onNext} />);
  return onNext;
}

/** The test ids of the body's parts, in order. */
function partsInOrder(): string[] {
  const body = screen.getByTestId('card-frame-body');
  return within(body)
    .getAllByTestId(/^(code-block|cycle-tiles|concept-spacer|primary-button-face)$/)
    .map((part) => String(part.props.testID));
}

afterEach(() => {
  jest.useRealTimers();
});

describe('ConceptCard without code', () => {
  it('starts from a demo card that has all three code fields', () => {
    expect([snippet, snippetComment, cycles].every((field) => field !== undefined)).toBe(true);
  });

  it('shows the title and body, no code block and no tiles, then the spacer and Got it', () => {
    const onNext = renderCard(PLAIN);

    expect(screen.getByRole('header', { name: PLAIN.title })).toBeOnTheScreen();
    expect(screen.getByTestId('bold-span')).toHaveTextContent('rank()', { exact: true });
    expect(partsInOrder()).toStrictEqual(['concept-spacer', 'primary-button-face']);
    expect(viewStyleOf(screen.getByTestId('concept-spacer'))).toStrictEqual({ flex: 1 });
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('runs no highlight timer while active', () => {
    jest.useFakeTimers();
    renderCard(PLAIN);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('shows a snippet with no cycles in the code block, with no tiles', () => {
    renderCard({ ...PLAIN, snippet: QUERY });

    expect(partsInOrder()).toStrictEqual(['code-block', 'concept-spacer', 'primary-button-face']);
    expect(screen.getByTestId('code-block-code')).toHaveTextContent(QUERY);
    expect(screen.queryByTestId('code-block-comment')).toBeNull();
  });

  it('draws no tiles for cycles with no snippet', () => {
    renderCard({ ...PLAIN, cycles: ['1', '2'] });

    expect(partsInOrder()).toStrictEqual(['concept-spacer', 'primary-button-face']);
  });

  it('draws the code block and the tiles when both are given', () => {
    renderCard({ ...PLAIN, snippet: QUERY, cycles: ['1', '2', '2'] });

    expect(partsInOrder()).toStrictEqual([
      'code-block',
      'cycle-tiles',
      'concept-spacer',
      'primary-button-face',
    ]);
    expect(screen.getAllByTestId('cycle-tile')).toHaveLength(3);
  });
});
