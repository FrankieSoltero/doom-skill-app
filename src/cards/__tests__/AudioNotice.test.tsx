import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { CardFrame } from '../../components/CardFrame';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { STRUDEL_ERROR } from '../../strudel/useStrudel';
import { colors, fonts } from '../../theme';
import { AudioNotice, type AudioStatus } from '../AudioNotice';

const QUIET: AudioStatus = { status: 'ready', playing: false, error: null, needsNetwork: false };

/** Draws the notice for `audio` in the exercise card's frame and returns its `onReset`. */
function renderNotice(change: Partial<AudioStatus>) {
  const onReset = jest.fn<undefined, []>();
  render(
    <CardFrame type="exercise" kicker="Exercise · REPL">
      <AudioNotice audio={{ ...QUIET, ...change }} onReset={onReset} />
    </CardFrame>,
  );
  return onReset;
}

const label = () => screen.getByTestId('result-badge-label');
const message = () => screen.getByTestId('result-badge-message');
const resetButton = () => screen.queryByRole('button', { name: 'Reset audio' });
const fillOf = () => textStyleOf(label()).backgroundColor;

describe('AudioNotice: which notice', () => {
  it.each<[string, Partial<AudioStatus>]>([
    ['a ready, quiet player', {}],
    ['a playing player', { playing: true }],
    ['a starting player', { status: 'starting' }],
    ['no connection after playing stopped', { needsNetwork: true, playing: false }],
  ])('shows nothing for %s', (_, change) => {
    renderNotice(change);

    expect(screen.queryByTestId('audio-notice')).toBeNull();
  });

  it('says audio needs a connection while playing without samples, in yellow, no Reset', () => {
    renderNotice({ needsNetwork: true, playing: true });

    expect(label()).toHaveTextContent('Audio needs a connection', { exact: true });
    expect(fillOf()).toBe(colors.yellow);
    expect(screen.queryByTestId('result-badge-message')).toBeNull();
    expect(resetButton()).toBeNull();
  });

  it('says audio is unavailable, in coral, with a Reset action', () => {
    renderNotice({ status: 'unavailable' });

    expect(label()).toHaveTextContent('Audio unavailable', { exact: true });
    expect(fillOf()).toBe(colors.coral);
    expect(resetButton()).toBeOnTheScreen();
  });

  it('shows an error over everything else, with a Reset action', () => {
    renderNotice({ error: 'boom', status: 'unavailable', needsNetwork: true, playing: true });

    expect(screen.getAllByTestId('result-badge')).toHaveLength(1);
    expect(label()).toHaveTextContent('Audio error', { exact: true });
    expect(message()).toHaveTextContent('boom', { exact: true });
    expect(fillOf()).toBe(colors.coral);
    expect(resetButton()).toBeOnTheScreen();
  });

  it('shows unavailable over no connection', () => {
    renderNotice({ status: 'unavailable', needsNetwork: true, playing: true });

    expect(label()).toHaveTextContent('Audio unavailable', { exact: true });
  });
});

describe('AudioNotice: error text', () => {
  it.each([
    [STRUDEL_ERROR.codeTooLong, 'The code is too long to play'],
    [STRUDEL_ERROR.playerUnavailable, 'Audio unavailable'],
  ])('words the fixed key %s as %s', (key, text) => {
    renderNotice({ error: key });

    expect(message()).toHaveTextContent(text, { exact: true });
  });

  it('shows page text as typed: no bold, no tags', () => {
    const pageText = 'SyntaxError: **bold** <b>tag</b> [x](https://example.com)';
    renderNotice({ error: pageText });

    expect(message()).toHaveTextContent(pageText, { exact: true });
    expect(screen.queryByTestId('bold-span')).toBeNull();
  });

  it('cuts page text to its first 200 characters', () => {
    const pageText = `${'a'.repeat(199)}bc${'d'.repeat(799)}`;
    renderNotice({ error: pageText });

    expect(message()).toHaveTextContent(`${'a'.repeat(199)}b`, { exact: true });
  });

  it('never splits a character made of two code units at the cut', () => {
    renderNotice({ error: `${'a'.repeat(199)}🎵🎵` });

    expect(message()).toHaveTextContent(`${'a'.repeat(199)}🎵`, { exact: true });
  });
});

describe('AudioNotice: Reset', () => {
  it('calls onReset once when pressed', () => {
    const onReset = renderNotice({ status: 'unavailable' });

    const reset = resetButton();
    if (reset === null) throw new Error('no Reset action');
    fireEvent.press(reset);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('is at least 44 points tall, in 14 point paper heading text, with a faded border', () => {
    renderNotice({ error: 'boom' });

    const reset = resetButton();
    if (reset === null) throw new Error('no Reset action');
    expect(viewStyleOf(reset)).toMatchObject({ minHeight: 44, minWidth: 44 });
    expect(textStyleOf(within(reset).getByText('Reset audio'))).toStrictEqual({
      fontFamily: fonts.heading,
      fontSize: 14,
      color: colors.paper,
    });
    expect(viewStyleOf(within(reset).getByTestId('faded-border')).opacity).toBe(0.45);
  });

  it('sits beside the badge, which takes the rest of the row', () => {
    renderNotice({ error: 'boom' });

    expect(viewStyleOf(screen.getByTestId('audio-notice'))).toStrictEqual({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    });
    expect(viewStyleOf(screen.getByTestId('audio-notice-badge'))).toStrictEqual({ flex: 1 });
  });
});
