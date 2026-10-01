// The card of a topic being built (src/components/PendingTopic.tsx), over a fake job answer.
import { act, render, screen } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { colors } from '../../theme';
import { useFocusEffect as mockUseFocusEffect } from '../../topics/testing/focus';
import { PendingTopic } from '../PendingTopic';
import { viewStyleOf } from '../testing/styles';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const JOB_ID = 'job-1';
const job = (status: string) =>
  json(200, { id: JOB_ID, kind: 'ingest_topic', progress: {}, reason: 'internal', status });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderPending(answers: Response[], onReady = jest.fn()) {
  serveApi({ [`GET /jobs/${JOB_ID}`]: answers });
  const { wrapper } = queryWrapper();
  render(<PendingTopic jobId={JOB_ID} title="Rust ownership" onReady={onReady} />, { wrapper });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return onReady;
}

describe('PendingTopic', () => {
  it('shows the kicker, the title and the waiting line on a violet card', async () => {
    await renderPending([job('queued')]);

    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
    expect(screen.getByText('Rust ownership')).toBeOnTheScreen();
    expect(screen.getByText('Waiting to start…')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('pending-topic-body'))).toMatchObject({
      backgroundColor: colors.violet,
      borderColor: colors.ink,
    });
  });

  it('shows the running line while the job runs', async () => {
    await renderPending([job('running')]);

    expect(screen.getByText('Reading sources…')).toBeOnTheScreen();
  });

  it("shows a fixed line for a failed job, never the job's reason", async () => {
    await renderPending([job('failed')]);

    expect(screen.getByText("Couldn't build this topic.")).toBeOnTheScreen();
    expect(screen.queryByText('internal')).toBeNull();
  });

  it('calls onReady once when the job is done', async () => {
    const onReady = await renderPending([job('running'), job('done')]);
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(9000);
    });

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('says to check back after 10 minutes', async () => {
    await renderPending([job('running')]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * 60_000);
    });

    expect(screen.getByText('Still building. Check back later.')).toBeOnTheScreen();
  });
});
