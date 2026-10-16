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
const job = (status: string, more: Record<string, unknown> = {}) =>
  json(200, {
    id: JOB_ID,
    kind: 'ingest_topic',
    progress: {},
    reason: 'internal',
    status,
    ...more,
  });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderPending(answers: Response[], onReady = jest.fn(), proposed = false) {
  serveApi({ [`GET /jobs/${JOB_ID}`]: answers });
  const { wrapper } = queryWrapper();
  render(
    <PendingTopic jobId={JOB_ID} title="Rust ownership" onReady={onReady} proposed={proposed} />,
    { wrapper },
  );
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

  it('says a proposed topic waits for approval once its job is done', async () => {
    await renderPending([job('done')], jest.fn(), true);

    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(screen.queryByText('Ready. Tap to open.')).toBeNull();
  });

  it('says to check back after 10 minutes', async () => {
    await renderPending([job('running')]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * 60_000);
    });

    expect(screen.getByText('Still building. Check back later.')).toBeOnTheScreen();
  });
});

// A server that reports the job's stage (Explore plan Task 6): the line follows the stage.
describe('PendingTopic: the stage', () => {
  it.each([
    ['queued', 2, 'Queued — 2 ahead'],
    ['queued', 1, 'Queued — 1 ahead'],
    ['queued', 0, 'Queued'],
    ['resolving', 0, 'Resolving sources'],
    ['ingesting', 0, 'Reading sources'],
    ['synthesizing', 0, 'Building the tree'],
    ['generating', 0, 'Writing cards'],
  ])('says %s (%i ahead) as "%s"', async (stage, ahead, line) => {
    await renderPending([job(stage === 'queued' ? 'queued' : 'running', { stage, ahead })]);

    expect(screen.getByText(line)).toBeOnTheScreen();
  });

  it('says a job waiting for a review so, on a proposed card', async () => {
    await renderPending([job('done', { stage: 'waiting', ahead: 0 })], jest.fn(), true);

    expect(screen.getByText('Waiting for a review')).toBeOnTheScreen();
    expect(screen.queryByText('Waiting for approval')).toBeNull();
  });

  it.each([
    ['invalid_output', "Couldn't make sense of that text — try a suggestion"],
    ['handler_error', 'Build failed — try again later'],
    [null, 'Build failed — try again later'],
  ])('says a failed build (reason %s) as "%s", never the reason', async (reason, line) => {
    const onReady = await renderPending([job('failed', { stage: 'failed', ahead: 0, reason })]);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't build this topic.")).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('says a done build is ready and calls onReady, even on a card first proposed', async () => {
    const onReady = await renderPending(
      [job('done', { stage: 'done', ahead: 0 })],
      jest.fn(),
      true,
    );

    expect(screen.getByText('Ready. Tap to open.')).toBeOnTheScreen();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('follows a done job whose topic is still being built, and is ready only when it is', async () => {
    const onReady = await renderPending([
      job('done', { stage: 'ingesting', ahead: 0 }),
      job('done', { stage: 'done', ahead: 0 }),
    ]);
    expect(screen.getByText('Reading sources')).toBeOnTheScreen();
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText('Ready. Tap to open.')).toBeOnTheScreen();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
