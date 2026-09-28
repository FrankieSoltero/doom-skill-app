import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { colors } from '../../theme';
import { Toast } from '../Toast';
import { textStyleOf, viewStyleOf } from '../testing/styles';

const MESSAGE = 'Answer this card to continue';

let announce: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {
    // Nothing to announce to in a test.
  });
});

// Runs even when a test failed first. React Native's Jest setup already makes the announce call a
// `jest.fn`, so the spy is that function and `mockRestore` clears its calls; `restoreAllMocks`
// puts back any replaced `Platform.OS`.
afterEach(() => {
  announce.mockRestore();
  jest.restoreAllMocks();
});

describe('Toast', () => {
  it('renders nothing and announces nothing while hidden', () => {
    render(<Toast message={MESSAGE} visible={false} />);

    expect(screen.toJSON()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('shows the message in 12-point paper text on an ink fill', () => {
    render(<Toast message={MESSAGE} visible />);

    expect(textStyleOf(screen.getByText(MESSAGE))).toMatchObject({
      fontSize: 12,
      color: colors.paper,
    });
    expect(viewStyleOf(screen.getByTestId('toast'))).toMatchObject({
      backgroundColor: colors.ink,
      paddingVertical: 6,
      paddingHorizontal: 12,
    });
  });

  it('sits centered 44 points above the bottom of its parent and takes no touches', () => {
    render(<Toast message={MESSAGE} visible />);

    expect(viewStyleOf(screen.getByTestId('toast-anchor'))).toMatchObject({
      position: 'absolute',
      bottom: 44,
      left: 0,
      right: 0,
      alignItems: 'center',
      pointerEvents: 'none',
    });
  });

  it('is a polite live region, so Android reads it when it appears', () => {
    render(<Toast message={MESSAGE} visible />);

    expect(screen.getByTestId('toast').props).toMatchObject({ accessibilityLiveRegion: 'polite' });
  });

  it('announces the message on iOS each time it appears', () => {
    const { rerender } = render(<Toast message={MESSAGE} visible />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(MESSAGE);

    rerender(<Toast message={MESSAGE} visible />);
    expect(announce).toHaveBeenCalledTimes(1);

    rerender(<Toast message={MESSAGE} visible={false} />);
    rerender(<Toast message={MESSAGE} visible />);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('leaves Android to the live region, so the message is not read twice', () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    render(<Toast message={MESSAGE} visible />);

    expect(announce).not.toHaveBeenCalled();
  });
});

describe('Toast test isolation', () => {
  it('runs on iOS again after the Android case', () => {
    expect(Platform.OS).toBe('ios');
  });
});
