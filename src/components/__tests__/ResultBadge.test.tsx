import { render, screen, within } from '@testing-library/react-native';

import { colors, fonts } from '../../theme';
import { CardFrame } from '../CardFrame';
import { ResultBadge } from '../ResultBadge';
import { type Element, textStyleOf, viewStyleOf } from '../testing/styles';

type Tone = 'pass' | 'warn' | 'error';

/** Draws a badge inside the exercise card's frame, which gives paper text. */
function renderBadge(tone: Tone, label: string, message: string) {
  render(
    <CardFrame type="exercise" kicker="Exercise · REPL">
      <ResultBadge tone={tone} label={label} message={message} />
    </CardFrame>,
  );
}

const label = () => screen.getByTestId('result-badge-label');

/** The first child of `element`, as React renders it: the message's text component. */
function outerText(element: Element): Element {
  const [text] = element.children;
  if (text === undefined || typeof text === 'string') throw new Error('no text inside the box');
  return text;
}

describe('ResultBadge look', () => {
  it.each([
    { tone: 'pass' as const, fill: colors.lime },
    { tone: 'warn' as const, fill: colors.yellow },
    { tone: 'error' as const, fill: colors.coral },
  ])('fills the $tone label, in ink heading text padded 0 and 6, README.md:107-109', (row) => {
    renderBadge(row.tone, 'Spec met', 'Well done.');

    expect(label()).toHaveTextContent('Spec met', { exact: true });
    expect(textStyleOf(label())).toMatchObject({
      backgroundColor: row.fill,
      color: colors.ink,
      fontFamily: fonts.heading,
      fontSize: 14,
      lineHeight: 22,
      paddingHorizontal: 6,
      paddingVertical: 0,
      flexShrink: 0,
    });
  });

  it('keeps the label on one line and lets the message wrap beside it', () => {
    renderBadge('warn', 'Not yet', 'Change how many times hh repeats inside the cycle.');

    expect(label().props).toHaveProperty('numberOfLines', 1);
    expect(viewStyleOf(screen.getByTestId('result-badge'))).toMatchObject({
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    });
    const box = screen.getByTestId('result-badge-message');
    expect(viewStyleOf(box)).toStrictEqual({ flexShrink: 1 });
    expect(box).toHaveTextContent('Change how many times hh repeats inside the cycle.');
    const message = outerText(box);
    const { numberOfLines } = message.props as { numberOfLines?: number };
    expect(numberOfLines).toBeUndefined();
    expect(textStyleOf(message)).toStrictEqual({
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 22,
      color: colors.paper,
    });
  });

  it('is a polite live region, so a new result is read out', () => {
    renderBadge('pass', 'Spec met', 'Well done.');

    expect(screen.getByTestId('result-badge').props).toHaveProperty(
      'accessibilityLiveRegion',
      'polite',
    );
  });

  it('draws no message when the message is empty', () => {
    renderBadge('error', 'Audio unavailable', '');

    const badge = screen.getByTestId('result-badge');
    expect(within(badge).getAllByText(/./)).toHaveLength(1);
    expect(badge).toHaveTextContent('Audio unavailable', { exact: true });
  });
});

describe('ResultBadge message', () => {
  it.each(['pass' as const, 'warn' as const])(
    'draws a %s message as trusted card text, with its bold marking',
    (tone) => {
      renderBadge(tone, 'Spec met', 'The hi-hat now plays **eight** times.');

      expect(screen.getByTestId('bold-span')).toHaveTextContent('eight', { exact: true });
      expect(screen.getByText('The hi-hat now plays eight times.')).toBeOnTheScreen();
    },
  );

  it('draws an error message as plain text: bold markers and tags are shown as typed', () => {
    const pageText = 'ReferenceError: **bold** <b>tag</b> [link](https://example.com)';
    renderBadge('error', 'Audio error', pageText);

    expect(screen.queryByTestId('bold-span')).toBeNull();
    const message = screen.getByText(pageText);
    expect(message.children).toStrictEqual([pageText]);
  });
});
