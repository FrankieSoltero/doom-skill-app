// The page runs learner code, which can post to the app in a loop. The bridge's gate drops what a
// page sends beyond 60 messages a second or beyond 64 KB a message, before `decode` reads it.
import { logWarning } from '../../log';
import { createMessageGate, MAX_MESSAGE_LENGTH, MAX_MESSAGES_PER_SECOND } from '../bridge';
import { advance, mountPlayer } from '../testing/player';
import { pagePosts, postRaw } from '../testing/webview';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const STEP = JSON.stringify({ type: 'step', step: 1 });
const floodWarnings = () =>
  jest.mocked(logWarning).mock.calls.filter(([event]) => event === 'strudel_message_flood');

/** A clock the test moves by hand, in milliseconds. */
function manualClock() {
  const clock = { now: 0 };
  return { clock, now: () => clock.now };
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('createMessageGate', () => {
  it('holds the limits the brief sets: 60 a second, 64 KB a message', () => {
    expect(MAX_MESSAGES_PER_SECOND).toBe(60);
    expect(MAX_MESSAGE_LENGTH).toBe(64 * 1024);
  });

  it('lets 60 of 200 messages sent in one tick through and logs the flood once', () => {
    const { now } = manualClock();
    const admit = createMessageGate(now);

    const admitted = Array.from({ length: 200 }, () => admit(STEP)).filter(Boolean);

    expect(admitted).toHaveLength(60);
    expect(floodWarnings()).toStrictEqual([['strudel_message_flood']]);
  });

  it('lets messages through again once the second has passed, without logging again', () => {
    const { clock, now } = manualClock();
    const admit = createMessageGate(now);
    for (let sent = 0; sent < 61; sent += 1) admit(STEP);

    clock.now = 999;
    expect(admit(STEP)).toBe(false);
    clock.now = 1000;
    expect(admit(STEP)).toBe(true);
    expect(floodWarnings()).toHaveLength(1);
  });

  it('counts a sliding second, not a fixed one', () => {
    const { clock, now } = manualClock();
    const admit = createMessageGate(now);
    for (let sent = 0; sent < 30; sent += 1) admit(STEP);
    clock.now = 500;
    for (let sent = 0; sent < 30; sent += 1) admit(STEP);

    clock.now = 999;
    expect(admit(STEP)).toBe(false);
    clock.now = 1000;
    expect([admit(STEP), admit(STEP)]).toStrictEqual([true, true]);
  });

  it('drops a message longer than 64 KB and lets one of exactly 64 KB through', () => {
    const admit = createMessageGate(manualClock().now);

    expect(admit('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
    expect(admit('x'.repeat(MAX_MESSAGE_LENGTH))).toBe(true);
    expect(floodWarnings()).toHaveLength(1);
  });

  it('lets a message that is not a string through, for decode to refuse', () => {
    const admit = createMessageGate(manualClock().now);

    expect([admit(undefined), admit(42), admit({ type: 'ready' })]).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect(floodWarnings()).toStrictEqual([]);
  });

  it('logs once per gate: a new gate logs a new flood', () => {
    const { now } = manualClock();
    const first = createMessageGate(now);
    const second = createMessageGate(now);
    for (let sent = 0; sent < 100; sent += 1) {
      first(STEP);
      second(STEP);
    }

    expect(floodWarnings()).toHaveLength(2);
  });
});

describe('useStrudel behind the gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('drops what a flooding page sends past 60 in a second, ready included, before decoding it', () => {
    const { result } = mountPlayer();
    for (let sent = 0; sent < 200; sent += 1) postRaw(STEP);

    pagePosts({ type: 'ready' });
    expect(result.current.status).toBe('starting');
    expect(floodWarnings()).toStrictEqual([['strudel_message_flood']]);

    advance(1000);
    pagePosts({ type: 'ready' });
    expect(result.current.status).toBe('ready');
  });

  it('drops an oversized message without reading it', () => {
    const { result } = mountPlayer();
    const padded = `{"type":"ready","pad":"${'x'.repeat(MAX_MESSAGE_LENGTH)}"}`;

    postRaw(padded);

    expect(result.current.status).toBe('starting');
    expect(floodWarnings()).toStrictEqual([['strudel_message_flood']]);
  });
});
