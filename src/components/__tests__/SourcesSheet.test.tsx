// The sheet of a card's sources (M6 hardening Task 12): each source's title, licence and host; a
// tap opens the URL in the system browser, and only an `https` one. The schema already refuses any
// other URL (src/data/__tests__/schema.sources.test.ts); the sheet checks again, so these tests
// hand it URLs the schema would never let through.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { SourceLink } from '../../data';
import { logWarning } from '../../log';
import { SourcesSheet, hostOf } from '../SourcesSheet';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

/** React Native's Jest preset already makes `Linking`'s functions `jest.fn`s. */
const linking = jest.mocked(Linking);

const MINI: SourceLink = {
  title: 'Mini-notation',
  url: 'https://strudel.cc/learn/mini-notation/',
  license: 'AGPL-3.0-or-later',
};
const POLY: SourceLink = {
  title: 'Polymeter',
  url: 'https://en.wikipedia.org/wiki/Polymeter',
  license: null,
};

function renderSheet(sources: SourceLink[], visible = true) {
  const onClose = jest.fn<undefined, []>();
  render(<SourcesSheet visible={visible} sources={sources} onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  linking.openURL.mockReset();
  linking.openURL.mockResolvedValue(true);
  jest.mocked(logWarning).mockClear();
});

describe('SourcesSheet', () => {
  it('lists each source with its title, its licence and the host of its URL', () => {
    renderSheet([MINI, POLY]);
    const sheet = screen.getByTestId('sources-sheet');

    expect(within(sheet).getByRole('header', { name: 'Sources' })).toBeOnTheScreen();
    expect(within(sheet).getByText('Mini-notation')).toBeOnTheScreen();
    expect(within(sheet).getByText('Licence: AGPL-3.0-or-later')).toBeOnTheScreen();
    expect(within(sheet).getByText('strudel.cc')).toBeOnTheScreen();
    expect(within(sheet).getByText('Polymeter')).toBeOnTheScreen();
    expect(within(sheet).getByText('Licence: unknown')).toBeOnTheScreen();
    expect(within(sheet).getByText('en.wikipedia.org')).toBeOnTheScreen();
    expect(within(sheet).getAllByRole('link')).toHaveLength(2);
  });

  it('opens the URL of the source tapped in the system browser, and keeps the sheet open', () => {
    renderSheet([MINI, POLY]);

    fireEvent.press(screen.getByRole('link', { name: /Polymeter/ }));

    expect(linking.openURL.mock.calls).toStrictEqual([[POLY.url]]);
    expect(screen.getByTestId('sources-sheet')).toBeOnTheScreen();
  });

  it.each([
    ['an http URL', 'http://strudel.cc/learn/'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an https URL with a leading space', ' https://strudel.cc/'],
    ['an intent URL', 'intent://scan/#Intent;scheme=zxing;end'],
  ])('never opens %s', (_name, url) => {
    renderSheet([{ ...MINI, url }]);

    fireEvent.press(screen.getByRole('link', { name: /Mini-notation/ }));

    expect(linking.openURL.mock.calls).toStrictEqual([]);
  });

  it('logs a URL the system could not open by the event alone, never the URL', async () => {
    linking.openURL.mockRejectedValueOnce(new Error('No app for https://strudel.cc/learn/'));
    renderSheet([MINI]);

    fireEvent.press(screen.getByRole('link', { name: /Mini-notation/ }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([['source_open_failed']]);
  });

  it('closes on Close', () => {
    const { onClose } = renderSheet([MINI]);

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing while not visible', () => {
    renderSheet([MINI], false);

    expect(screen.queryByTestId('sources-sheet')).toBeNull();
  });
});

describe('hostOf', () => {
  it.each([
    ['https://strudel.cc/learn/', 'strudel.cc'],
    ['https://Docs.Example.test:8443/a?b#c', 'docs.example.test:8443'],
    ['https://user:pass@real.test/', 'real.test'],
    ['https://shown.test\\@hidden.test/', 'shown.test'],
    ['https://real.test?x=@other.test', 'real.test'],
    ['http://strudel.cc/', ''],
    ['javascript:alert(1)', ''],
  ])('reads the host of %s as %p', (url, host) => {
    expect(hostOf(url)).toBe(host);
  });
});
