import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import * as log from '../../log';
import { secureStoreItems } from '../__mocks__/secureStore';
import { secureSession } from '../secureSession';

const NAME = 'sb-project-auth-token';
const ACCESS = 'access-token-marker';
const REFRESH = 'refresh-token-marker';
/** A session as supabase-js writes it, with a four-byte UTF-8 character in the user's name. */
const SESSION = JSON.stringify({
  access_token: ACCESS,
  refresh_token: REFRESH,
  expires_at: 1_900_000_000,
  user: { id: 'user-1', user_metadata: { name: 'Frankie 🎹 Ñ' } },
});
/** Key (32 bytes) and counter (16 bytes), base64: 64 characters. */
const KEY_MATERIAL_LENGTH = 64;

// What this module gives the logger, and what the logger writes (kept off the test output).
const warn = jest.spyOn(log, 'logWarning');
const error = jest.spyOn(log, 'logError');
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

async function stored(): Promise<{ key: string | undefined; data: string | null }> {
  return { key: secureStoreItems.get(NAME), data: await AsyncStorage.getItem(NAME) };
}

function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function base64Of(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** The ciphertext with one bit flipped in its first byte, still valid base64. */
function flipFirstByte(data: string): string {
  const bytes = bytesOf(data);
  bytes[0] = (bytes[0] ?? 0) ^ 0x04;
  return base64Of(bytes);
}

/**
 * A ciphertext that decrypts to `plaintext` under the stored key: counter mode XORs the plaintext
 * with a key stream, and the stored session's ciphertext gives that stream away.
 */
function forge(data: string, plaintext: Uint8Array): string {
  const cipher = bytesOf(data);
  const original = new TextEncoder().encode(SESSION);
  return base64Of(plaintext.map((byte, i) => byte ^ (cipher[i] ?? 0) ^ (original[i] ?? 0)));
}

/** Session-shaped JSON whose access token holds the byte 0xFF, which UTF-8 never uses. */
function notUtf8(): Uint8Array {
  const bytes = new TextEncoder().encode('{"access_token":"?","refresh_token":"r"}');
  bytes[17] = 0xff;
  return bytes;
}

beforeEach(async () => {
  secureStoreItems.clear();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('secureSession, a stored session', () => {
  it('gives back the value it stored, and nothing once removed', async () => {
    await secureSession.setItem(NAME, SESSION);

    expect(await secureSession.getItem(NAME)).toBe(SESSION);

    await secureSession.removeItem(NAME);

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
  });

  it('keeps only key material in the secure store and only ciphertext in async storage', async () => {
    await secureSession.setItem(NAME, SESSION);
    const { key, data } = await stored();

    expect(key).toHaveLength(KEY_MATERIAL_LENGTH);
    expect(atob(key ?? '')).toHaveLength(48);
    expect(data).not.toBeNull();
    expect(data).not.toContain(ACCESS);
    expect(atob(data ?? '')).not.toContain(ACCESS);
    expect(atob(data ?? '')).toHaveLength(new TextEncoder().encode(SESSION).length);
  });

  it('makes a new key and counter for every write', async () => {
    await secureSession.setItem(NAME, SESSION);
    const first = await stored();
    await secureSession.setItem(NAME, SESSION);
    const second = await stored();

    expect(second.key).not.toBe(first.key);
    expect(second.data).not.toBe(first.data);
    expect(await secureSession.getItem(NAME)).toBe(SESSION);
  });

  it('writes and reads the secure store after first unlock, on this device only', async () => {
    const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

    await secureSession.setItem(NAME, SESSION);
    await secureSession.getItem(NAME);
    await secureSession.removeItem(NAME);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(NAME, expect.any(String), options);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(NAME, options);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(NAME, options);
  });

  it('reads nothing, and logs nothing, when no session was stored', async () => {
    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('secureSession, a stored session it cannot read', () => {
  it.each([
    ['a flipped bit', flipFirstByte],
    ['text that is not base64', () => '%%% not base64 %%%'],
    ['bytes that are not the ones written', () => btoa('\xff\xfe\xfd')],
    ['a plaintext that is not UTF-8', (data: string) => forge(data, notUtf8())],
  ])('drops a ciphertext with %s', async (_case, corrupt) => {
    await secureSession.setItem(NAME, SESSION);
    const { data } = await stored();
    await AsyncStorage.setItem(NAME, corrupt(data ?? ''));

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
    expect(warn).toHaveBeenCalledWith('session_unreadable', { reason: 'undecodable' });
  });

  it('cannot tell a forged session-shaped value from a real one (no integrity check)', async () => {
    const forged = '{"access_token":"a","refresh_token":"b"}';
    await secureSession.setItem(NAME, SESSION);
    const { data } = await stored();
    await AsyncStorage.setItem(NAME, forge(data ?? '', new TextEncoder().encode(forged)));

    expect(await secureSession.getItem(NAME)).toBe(forged);
  });

  it('drops key material of the wrong length', async () => {
    await secureSession.setItem(NAME, SESSION);
    secureStoreItems.set(NAME, btoa('short'));

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
  });

  it.each([
    ['text that is not JSON', 'plain text'],
    ['JSON that is not an object', '"a string"'],
    ['an object without both tokens', JSON.stringify({ access_token: ACCESS })],
    ['tokens that are not strings', JSON.stringify({ access_token: 1, refresh_token: 2 })],
  ])('drops a value that is %s', async (_case, value) => {
    await secureSession.setItem(NAME, value);

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
  });

  it('drops the ciphertext when its key is missing', async () => {
    await secureSession.setItem(NAME, SESSION);
    secureStoreItems.delete(NAME);

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
    expect(warn).toHaveBeenCalledWith('session_unreadable', { reason: 'missing_key' });
  });

  it('drops the key when its ciphertext is missing', async () => {
    await secureSession.setItem(NAME, SESSION);
    await AsyncStorage.removeItem(NAME);

    expect(await secureSession.getItem(NAME)).toBeNull();
    expect(await stored()).toStrictEqual({ key: undefined, data: null });
    expect(warn).toHaveBeenCalledWith('session_unreadable', { reason: 'missing_data' });
  });
});

describe('secureSession, logs', () => {
  it('never logs the value, the key material or the ciphertext', async () => {
    await secureSession.setItem(NAME, SESSION);
    await secureSession.getItem(NAME);
    const { data } = await stored();
    await AsyncStorage.setItem(NAME, flipFirstByte(data ?? ''));
    await secureSession.getItem(NAME);
    await secureSession.setItem(NAME, SESSION);
    await AsyncStorage.removeItem(NAME);
    await secureSession.getItem(NAME);

    // Every key and ciphertext either store was given, the flipped one included.
    const written = [
      ...jest.mocked(SecureStore.setItemAsync).mock.calls,
      ...jest.mocked(AsyncStorage.setItem).mock.calls,
    ].map(([, value]) => value);
    const secrets = [ACCESS, REFRESH, SESSION, ...written];
    const calls = [warn, error, consoleWarn, consoleError].flatMap((spy) => spy.mock.calls);
    const lines = calls.map((call) => JSON.stringify(call));
    expect(written).toHaveLength(5);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(consoleWarn).toHaveBeenCalledTimes(2);
    for (const line of lines) {
      for (const secret of secrets) {
        expect(line).not.toContain(secret);
      }
    }
  });
});
