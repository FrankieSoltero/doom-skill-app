/**
 * Operations on one name that overlap in time. supabase-js (auth-js 2.117.2) has no lock of its
 * own, so `getSession()` can read the session while `_saveSession` writes a refreshed one. A read
 * that pairs one write's key with another write's ciphertext decrypts to garbage and removes the
 * session, so each operation on a name must wait for the one before it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { secureStoreItems } from '../__mocks__/secureStore';
import { secureSession } from '../secureSession';

const NAME = 'sb-project-auth-token';
const OTHER = 'sb-other-auth-token';
const OLD = JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh' });
const NEW = JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' });

// An unreadable session logs a warning; keep it off the test output.
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

/** A promise the test resolves by hand, to hold a store's write open. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Lets every pending promise callback and timer of zero delay run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Holds the next async-storage write (the ciphertext) until the gate opens. */
function delayCiphertextWrite(opened: Promise<void>): void {
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, value) => {
    await opened;
    await AsyncStorage.multiSet([[key, value]]);
  });
}

/** Holds the next secure-store write (the key and counter) until the gate opens. */
function delayKeyWrite(opened: Promise<void>): void {
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
    await opened;
    secureStoreItems.set(key, value);
  });
}

async function bothHalves(name: string): Promise<boolean> {
  return secureStoreItems.has(name) && (await AsyncStorage.getItem(name)) !== null;
}

beforeEach(async () => {
  secureStoreItems.clear();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('secureSession, a read during a write', () => {
  it.each([
    ['the ciphertext', delayCiphertextWrite],
    ['the key', delayKeyWrite],
  ])('gives the old or the new session while %s is being written', async (_half, delay) => {
    await secureSession.setItem(NAME, OLD);
    const { opened, open } = gate();
    delay(opened);

    const write = secureSession.setItem(NAME, NEW);
    const read = secureSession.getItem(NAME);
    await settle();
    open();
    await write;

    expect([OLD, NEW]).toContain(await read);
    expect(await bothHalves(NAME)).toBe(true);
    expect(await secureSession.getItem(NAME)).toBe(NEW);
  });

  it('runs a write, a removal and a read on one name in the order they were called', async () => {
    const { opened, open } = gate();
    delayCiphertextWrite(opened);

    const write = secureSession.setItem(NAME, NEW);
    const removal = secureSession.removeItem(NAME);
    const read = secureSession.getItem(NAME);
    await settle();
    open();
    await Promise.all([write, removal]);

    expect(await read).toBeNull();
    expect(secureStoreItems.has(NAME)).toBe(false);
    expect(await AsyncStorage.getItem(NAME)).toBeNull();
  });

  it('keeps going after an operation on the name fails', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    const failed = secureSession.setItem(NAME, OLD);
    const write = secureSession.setItem(NAME, NEW);

    await expect(failed).rejects.toThrow('disk full');
    await write;
    expect(await secureSession.getItem(NAME)).toBe(NEW);
  });
});

describe('secureSession, two names', () => {
  it('does not make one name wait for another', async () => {
    const { opened, open } = gate();
    delayCiphertextWrite(opened);
    let firstDone = false;
    const first = secureSession.setItem(NAME, OLD).then(() => {
      firstDone = true;
    });

    await secureSession.setItem(OTHER, NEW);
    expect(await secureSession.getItem(OTHER)).toBe(NEW);
    await secureSession.removeItem(OTHER);
    expect(await secureSession.getItem(OTHER)).toBeNull();
    expect(firstDone).toBe(false);

    open();
    await first;
    expect(await secureSession.getItem(NAME)).toBe(OLD);
  });
});
