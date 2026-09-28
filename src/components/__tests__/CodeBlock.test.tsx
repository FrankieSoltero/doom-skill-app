import { render, screen, within } from '@testing-library/react-native';

import { colors, type } from '../../theme';
import { CodeBlock } from '../CodeBlock';
import { textStyleOf, viewStyleOf } from '../testing/styles';

// Demo content from docs/design/card-feed/README.md:54 and :90-96.
const CONCEPT_CODE = 'note("<c3 e3 g3>")';
const CONCEPT_COMMENT = '// cycle 1 → c3 · 2 → e3 · 3 → g3';
const EXERCISE_CODE = 'stack(\n  s("bd ~ sd ~"),\n  s("hh*4")\n)';
const LONG_LINE = `s("${'bd sd '.repeat(40)}")`;

// Values the prototype gives and the theme does not hold, reference/LearnLoop Card Feed
// v2.dc.html:83-85: padding 14/16 and a 12px comment line at the block's 1.6 line height.
const PADDING = { paddingVertical: 14, paddingHorizontal: 16 };
const COMMENT_TEXT = { fontSize: 12, lineHeight: 19 };

/** Matches the whole text of an element exactly, keeping line breaks and spaces. */
const exact = { normalizer: (text: string) => text };

function tokensOfKind(kind: 'fn' | 'comment' | 'plain') {
  return screen.queryAllByTestId(`code-token-${kind}`);
}

describe('CodeBlock colors', () => {
  it('draws an ink block with paper code text in the code type style', () => {
    render(<CodeBlock code={CONCEPT_CODE} />);

    expect(viewStyleOf(screen.getByTestId('code-block')).backgroundColor).toBe(colors.ink);
    expect(textStyleOf(screen.getByTestId('code-block-code'))).toMatchObject({
      ...type.code,
      color: colors.paper,
    });
  });

  it('colors function names lime and the rest paper', () => {
    render(<CodeBlock code={CONCEPT_CODE} />);
    const [name, ...otherNames] = tokensOfKind('fn');
    const plain = tokensOfKind('plain');

    expect(otherNames).toHaveLength(0);
    expect(name).toHaveTextContent('note', { exact: true });
    expect(name && textStyleOf(name).color).toBe(colors.lime);
    expect(plain).toHaveLength(1);
    expect(plain.map((span) => textStyleOf(span).color)).toStrictEqual([colors.paper]);
  });

  it('colors a comment inside the code violet', () => {
    render(<CodeBlock code={'s("bd") // kick'} />);
    const [span, ...others] = tokensOfKind('comment');

    expect(others).toHaveLength(0);
    expect(span).toHaveTextContent('// kick', { exact: true });
    expect(span && textStyleOf(span).color).toBe(colors.violet);
  });
});

describe('CodeBlock text', () => {
  it('renders the code exactly, line breaks included, as one text of token spans', () => {
    render(<CodeBlock code={EXERCISE_CODE} />);
    const codeText = screen.getByTestId('code-block-code');

    expect(screen.getByText(EXERCISE_CODE, exact)).toBe(codeText);
    expect(within(codeText).getAllByTestId('code-token-fn')).toHaveLength(3);
    expect(within(codeText).getAllByTestId('code-token-plain')).toHaveLength(3);
  });

  it('renders the comment prop as its own line after the code, violet, as given', () => {
    render(<CodeBlock code={CONCEPT_CODE} comment={CONCEPT_COMMENT} />);
    const content = screen.getByTestId('code-block-content');
    const commentText = screen.getByTestId('code-block-comment');
    const [first, second, ...rest] = within(content).getAllByTestId(/^code-block-(code|comment)$/);

    expect(screen.getByText(CONCEPT_COMMENT, exact)).toBe(commentText);
    expect(content.children).toHaveLength(2);
    expect(first).toBe(screen.getByTestId('code-block-code'));
    expect(second).toBe(commentText);
    expect(rest).toHaveLength(0);
    expect(textStyleOf(commentText)).toMatchObject({
      ...type.code,
      ...COMMENT_TEXT,
      color: colors.violet,
    });
  });

  it.each<[string, string | undefined]>([
    ['omitted', undefined],
    ['empty', ''],
  ])('renders only the code when the comment is %s', (_case, comment) => {
    render(<CodeBlock code={CONCEPT_CODE} {...(comment === undefined ? {} : { comment })} />);

    expect(screen.queryByTestId('code-block-comment')).toBeNull();
    expect(screen.getByTestId('code-block-content').children).toHaveLength(1);
  });
});

describe('CodeBlock layout and accessibility', () => {
  it('scrolls a long line sideways only, sized to its content, never wrapping it', () => {
    render(<CodeBlock code={LONG_LINE} comment={CONCEPT_COMMENT} />);
    const block = screen.getByTestId('code-block');

    expect(block.props).toMatchObject({
      horizontal: true,
      directionalLockEnabled: true,
      alwaysBounceVertical: false,
    });
    // A horizontal ScrollView grows by default (flexGrow 1); the block keeps to its content.
    expect(viewStyleOf(block).flexGrow).toBe(0);
    expect(viewStyleOf(screen.getByTestId('code-block-content'))).toStrictEqual(PADDING);
    for (const testID of ['code-block-code', 'code-block-comment']) {
      const text = screen.getByTestId(testID);
      expect(text.props).not.toHaveProperty('numberOfLines');
      expect(textStyleOf(text)).not.toHaveProperty('flexShrink');
      expect(textStyleOf(text)).not.toHaveProperty('width');
    }
  });

  it('exposes the code as selectable text, with no role on the block', () => {
    render(<CodeBlock code={CONCEPT_CODE} comment={CONCEPT_COMMENT} />);
    const block = screen.getByTestId('code-block');

    expect(block.props).not.toHaveProperty('accessibilityRole');
    expect(block.props).not.toHaveProperty('role');
    expect(screen.getByTestId('code-block-code').props).toMatchObject({ selectable: true });
    expect(screen.getByTestId('code-block-comment').props).toMatchObject({ selectable: true });
    expect(screen.getByText(CONCEPT_CODE)).toBeOnTheScreen();
  });
});
