import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, type } from '../../theme';
import { ErrorScreen } from '../ErrorScreen';
import { textStyleOf, viewStyleOf } from '../testing/styles';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

// Insets on every side, which the error screen must leave to the screen that hosts it.
const INSETS = { top: 47, right: 5, bottom: 34, left: 7 };

function renderInsets(element: ReactElement) {
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  render(<SafeAreaProvider initialMetrics={{ frame, insets: INSETS }}>{element}</SafeAreaProvider>);
}

// React Native's Jest preset makes this a `jest.fn` already; the tests clear it themselves. The
// preset's platform is iOS.
const announceForAccessibility = jest.mocked(AccessibilityInfo.announceForAccessibility);

beforeEach(() => {
  announceForAccessibility.mockClear();
});

describe('ErrorScreen announcement', () => {
  it('announces its message once when it appears, and again only for a new message', () => {
    // Rendered bare, so a re-render keeps the same tree (the screen reads no insets).
    const view = render(<ErrorScreen message="Failed." />);
    expect(announceForAccessibility.mock.calls).toStrictEqual([['Failed.']]);

    view.rerender(<ErrorScreen message="Failed." actionLabel="Retry" onAction={jest.fn()} />);
    expect(announceForAccessibility).toHaveBeenCalledTimes(1);

    view.rerender(<ErrorScreen message="Nothing here." />);
    expect(announceForAccessibility.mock.calls).toStrictEqual([['Failed.'], ['Nothing here.']]);
  });

  it('holds the message in a polite live region, for Android', () => {
    renderInsets(<ErrorScreen message="Failed." />);

    const region = screen.getByTestId('error-message');
    expect(region.props).toHaveProperty('accessibilityLiveRegion', 'polite');
    expect(region).toHaveTextContent('Failed.', { exact: true });
  });
});

describe('ErrorScreen', () => {
  it('centers the message on a paper ground, with no inset padding of its own', () => {
    renderInsets(<ErrorScreen message="Nothing here." />);

    const style = viewStyleOf(screen.getByTestId('error-screen'));
    expect(style).toMatchObject({
      flex: 1,
      justifyContent: 'center',
      backgroundColor: colors.paper,
    });
    expect(Object.keys(style).filter((key) => key.startsWith('padding'))).toStrictEqual([]);
    expect(textStyleOf(screen.getByText('Nothing here.'))).toMatchObject({
      ...type.body,
      color: colors.ink,
      textAlign: 'center',
    });
  });

  it('shows the action as a button that calls onAction', () => {
    const onAction = jest.fn<undefined, []>();
    renderInsets(<ErrorScreen message="Failed." actionLabel="Retry" onAction={onAction} />);

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    { given: 'neither a label nor an action', props: {} },
    { given: 'a label only', props: { actionLabel: 'Retry' } },
    { given: 'an action only', props: { onAction: jest.fn() } },
  ])('shows no button given $given', ({ props }) => {
    renderInsets(<ErrorScreen message="Failed." {...props} />);

    expect(screen.getByText('Failed.')).toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { includeHiddenElements: true })).toHaveLength(0);
  });
});
