// The profile's link to the app's source (M7 open client): the build tag when the running build
// carries one, else "development build"; a tap opens the tagged tree on GitHub, or the repository
// itself with no tag. Only ever an `https` URL (mirrors src/components/SourcesSheet.tsx's rule).
//
// `buildTag` is mocked directly rather than through `process.env`: `EXPO_PUBLIC_` variables are
// inlined when `../../config` is first evaluated (src/__tests__/config.test.ts's `loadWith`
// documents the pattern that defeats that for config.ts's own tests), which would fix this file's
// value before any test ran.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { buildTag, SOURCE_REPOSITORY } from '../../config';
import { logWarning } from '../../log';
import { isHttpsUrl, SourceLink } from '../SourceLink';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('../../config', () => ({
  ...jest.requireActual<object>('../../config'),
  buildTag: jest.fn(),
}));

/** React Native's Jest preset already makes `Linking`'s functions `jest.fn`s. */
const linking = jest.mocked(Linking);
const tag = jest.mocked(buildTag);
const TAG = 'app-v1.0.0+abc1234';

beforeEach(() => {
  linking.openURL.mockReset();
  linking.openURL.mockResolvedValue(true);
  jest.mocked(logWarning).mockClear();
  tag.mockReset();
});

describe('SourceLink', () => {
  it('shows the build tag when the build carries one, and opens its tagged tree', () => {
    tag.mockReturnValue(TAG);
    render(<SourceLink />);

    expect(screen.getByText(TAG)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('link', { name: 'Source code' }));

    expect(linking.openURL.mock.calls).toStrictEqual([[`${SOURCE_REPOSITORY}/tree/${TAG}`]]);
  });

  it('shows "development build" and opens the repository when the build carries no tag', () => {
    tag.mockReturnValue(null);
    render(<SourceLink />);

    expect(screen.getByText('development build')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('link', { name: 'Source code' }));

    expect(linking.openURL.mock.calls).toStrictEqual([[SOURCE_REPOSITORY]]);
  });

  it('treats an invalid tag the same as no tag: development build, the repository root', () => {
    // `buildTag()` itself only ever returns a validly shaped tag or null (src/config.ts); this
    // checks that `SourceLink` does not second-guess that contract with its own parsing.
    tag.mockReturnValue(null);
    render(<SourceLink />);

    expect(screen.getByText('development build')).toBeOnTheScreen();
    expect(screen.queryByText(TAG)).toBeNull();
  });

  it('logs a failed open by the event alone, never the URL', async () => {
    linking.openURL.mockRejectedValueOnce(new Error('no app'));
    tag.mockReturnValue(null);
    render(<SourceLink />);

    fireEvent.press(screen.getByRole('link', { name: 'Source code' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([['source_link_open_failed']]);
  });
});

describe('isHttpsUrl', () => {
  it.each([
    ['https://github.com/FrankieSoltero/learnloop-app', true],
    ['http://github.com/FrankieSoltero/learnloop-app', false],
    ['javascript:alert(1)', false],
    [' https://github.com/FrankieSoltero/learnloop-app', false],
  ])('%s -> %p', (url, expected) => {
    expect(isHttpsUrl(url)).toBe(expected);
  });
});
