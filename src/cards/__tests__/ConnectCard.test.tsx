// The end card offline (offline-topic plan Task 6, O2): every kept set is answered and the server
// cannot be reached, so the feed says to connect, with Retry.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConnectCard } from '../ConnectCard';

describe('ConnectCard', () => {
  it('says to connect, and Retry asks again', () => {
    const onRetry = jest.fn();
    render(<ConnectCard onRetry={onRetry} />);

    expect(screen.getByTestId('connect-card')).toBeOnTheScreen();
    expect(screen.getByTestId('error-message')).toHaveTextContent('Connect to get more cards');
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
