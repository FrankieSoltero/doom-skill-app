import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, type } from '../../theme';
import { ErrorScreen } from '../ErrorScreen';
import { textStyleOf, viewStyleOf } from '../testing/styles';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

// Every side different, so a test can tell which inset pads which side.
const INSETS = { top: 47, right: 5, bottom: 34, left: 7 };

function renderInsets(element: ReactElement) {
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  render(<SafeAreaProvider initialMetrics={{ frame, insets: INSETS }}>{element}</SafeAreaProvider>);
}

describe('ErrorScreen', () => {
  it('centers the message on a paper ground padded by the safe-area insets', () => {
    renderInsets(<ErrorScreen message="Nothing here." />);

    expect(viewStyleOf(screen.getByTestId('error-screen'))).toMatchObject({
      flex: 1,
      justifyContent: 'center',
      backgroundColor: colors.paper,
      paddingTop: INSETS.top,
      paddingRight: INSETS.right,
      paddingBottom: INSETS.bottom,
      paddingLeft: INSETS.left,
    });
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
