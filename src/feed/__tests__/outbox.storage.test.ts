// The attempt outbox (src/feed/outbox.ts): what it keeps in async storage, counting, and the app's
// outbox with the demo sets. Keeping each user's attempts apart is in outbox.user.test.ts. Nothing
// leaves the test.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from '../../log';
import { createOutbox, outbox } from '../outbox';
import { SIGNED_OUT, attempt, offline, rig, settle } from '../testing/outbox';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

// Clears the log and async storage mocks between cases.
afterEach(() => {
  jest.clearAllMocks();
});

describe('storage', () => {
  it('sends what an earlier run left first, dropping entries that do not fit', async () => {
    const left = [
      { ...attempt(7), clientAttemptId: 'left-1' },
      { ...attempt(8), response: { choice: 'x' } },
      'not an attempt',
    ];
    const box = rig(JSON.stringify(left));
    box.outbox.add(attempt(1));
    await settle();

    expect(box.sent()).toStrictEqual(['left-1', 'id-1']);
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('outbox_entries_invalid', { count: 2 });
  });

  it('keeps a stored skip and sends it', async () => {
    const box = rig(JSON.stringify([{ ...attempt(7, { skipped: true }), clientAttemptId: 'x-1' }]));
    await settle();

    expect(box.post.mock.calls[0]?.[0].response).toStrictEqual({ skipped: true });
  });

  it('sends what an earlier run left as soon as it is made', async () => {
    const box = rig(JSON.stringify([{ ...attempt(7), clientAttemptId: 'left-1' }]));
    expect(box.outbox.pending()).toBe(0);

    await settle();

    expect(box.sent()).toStrictEqual(['left-1']);
    expect(box.outbox.pending()).toBe(0);
    expect(box.kept()).toStrictEqual([]);
  });

  it('starts empty when the stored text is not a list', async () => {
    const box = rig('{secret-marker');
    await settle();

    expect(box.outbox.pending()).toBe(0);
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('outbox_load_failed', {
      kind: 'SyntaxError',
    });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });

  it('keeps working in memory when the storage fails, and logs it', async () => {
    const box = rig();
    box.storage.getItem.mockRejectedValueOnce(new Error('read'));
    box.storage.setItem.mockRejectedValue(new Error('write'));
    const other = createOutbox({
      post: box.post,
      storage: box.storage,
      session: box.session,
      schedule: () => () => undefined,
      newId: () => 'mem-1',
    });
    box.answers.push(offline());

    other.add(attempt(1));
    await settle();

    expect(other.pending()).toBe(1);
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('outbox_load_failed', { kind: 'Error' });
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('outbox_save_failed', { kind: 'Error' });
  });
});

describe('sign-out, pending and subscribe', () => {
  it('does not bring back what an earlier run left when signed out before it was read', async () => {
    const box = rig(JSON.stringify([{ ...attempt(7), clientAttemptId: 'left-1' }]));

    box.session.set(SIGNED_OUT);
    await settle();

    expect(box.outbox.pending()).toBe(0);
    expect(box.sent()).toStrictEqual([]);
    expect(box.kept()).toStrictEqual([]);
  });

  it('tells subscribers when the count changes, until they leave', async () => {
    const box = rig();
    const counts: number[] = [];
    const leave = box.outbox.subscribe(() => counts.push(box.outbox.pending()));

    box.outbox.add(attempt(1));
    await settle();
    leave();
    box.outbox.add(attempt(2));
    await settle();

    expect(counts).toStrictEqual([1, 0]);
  });
});

describe('the app outbox with the demo sets (this run has no API)', () => {
  it('does nothing: it stores, sends and counts nothing', async () => {
    outbox.add(attempt(1));
    await outbox.flush();
    const leave = outbox.subscribe(() => undefined);
    leave();

    expect(outbox.pending()).toBe(0);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
