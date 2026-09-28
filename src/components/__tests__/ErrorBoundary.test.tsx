import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { logError } from '../../log';
import { ErrorBoundary } from '../ErrorBoundary';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const failure = new Error('card broke');

// Read by Failing on every render, so a test can let it render cleanly after a failure.
let failNextRender = true;

function Failing() {
  if (failNextRender) {
    throw failure;
  }
  return <Text>children</Text>;
}

function Screen({ boundaryKey = 'a' }: { boundaryKey?: string }) {
  return (
    <View>
      <ErrorBoundary key={boundaryKey} name="card" fallback={<Text>fallback</Text>}>
        <Failing />
      </ErrorBoundary>
      <Text>sibling</Text>
    </View>
  );
}

let consoleError: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  failNextRender = true;
  jest.mocked(logError).mockClear();
  // React reports every error a boundary catches through console.error; keep the run quiet.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children and not the fallback when nothing throws', () => {
    failNextRender = false;

    render(<Screen />);

    expect(screen.getByText('children')).toBeOnTheScreen();
    expect(screen.queryByText('fallback')).toBeNull();
    expect(logError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('adds no view of its own around what it renders', () => {
    failNextRender = false;

    render(
      <ErrorBoundary name="card" fallback={<Text>fallback</Text>}>
        <Text>children</Text>
      </ErrorBoundary>,
    );

    expect(screen.toJSON()).toMatchObject({ type: 'Text', children: ['children'] });
  });

  it('renders the fallback when a child throws while rendering', () => {
    render(<Screen />);

    expect(screen.getByText('fallback')).toBeOnTheScreen();
    expect(screen.queryByText('children')).toBeNull();
  });

  it('leaves a sibling outside the boundary rendered when a child throws', () => {
    render(<Screen />);

    expect(screen.getByText('sibling')).toBeOnTheScreen();
  });

  it('logs render_failed once, with the thrown error and the boundary name', () => {
    render(<Screen />);

    expect(jest.mocked(logError).mock.calls).toStrictEqual([
      ['render_failed', failure, { boundary: 'card' }],
    ]);
    expect(jest.mocked(logError).mock.calls[0]?.[1]).toBe(failure);
  });

  it('keeps the fallback on a re-render with the same key', () => {
    render(<Screen />);
    failNextRender = false;

    screen.rerender(<Screen />);

    expect(screen.getByText('fallback')).toBeOnTheScreen();
    expect(screen.queryByText('children')).toBeNull();
  });

  it('renders its children again when its key changes', () => {
    render(<Screen />);
    failNextRender = false;

    screen.rerender(<Screen boundaryKey="b" />);

    expect(screen.getByText('children')).toBeOnTheScreen();
    expect(screen.queryByText('fallback')).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
