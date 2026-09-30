/**
 * Where supabase-js keeps the session: the storage it takes as `auth.storage` (`getItem`,
 * `setItem`, `removeItem`). The session is never written to plain storage (the plan's global
 * constraints).
 *
 * A session is larger than the secure store's 2,048-byte value limit, so each `setItem` makes a
 * new random 256-bit key and a new random 128-bit counter (`crypto.getRandomValues`, which
 * `react-native-get-random-values` provides; `app/_layout.tsx` imports it first), encrypts the
 * value with AES-256 in counter mode (`aes-js`), and stores:
 * - the key and the counter (48 bytes, base64) in the secure store (the iOS keychain, readable
 *   after the device's first unlock and never moved to another device), under the item's name;
 * - the ciphertext (base64) in async storage, under the same name.
 *
 * `getItem` reads both and decrypts. A missing half, a ciphertext or key that does not decode, a
 * plaintext that is not UTF-8, or one that is not JSON in the shape supabase-js writes (an object
 * with `access_token` and `refresh_token` strings) gives `null`, and both halves are removed. So
 * this storage holds sessions only: any other value supabase-js might keep here reads as `null`.
 *
 * Limitation: this gives confidentiality at rest, not integrity. Counter mode has no
 * authentication tag and `aes-js` offers no MAC, so a ciphertext changed on disk decrypts without
 * error; the shape check refuses most such changes, but someone who can write the device's app
 * storage and knows the plaintext can forge a session-shaped value (the test shows it). The
 * server verifies every token it is sent, so a forged token gets no access.
 *
 * Nothing here logs the key, the value or the ciphertext: an unreadable session logs
 * `session_unreadable` with a fixed reason only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';

import { logWarning } from '../log';

/** AES-256: a 32-byte key. */
const KEY_BYTES = 32;

/** The counter block's size, the AES block size. */
const COUNTER_BYTES = 16;

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type Unreadable = 'missing_key' | 'missing_data' | 'undecodable';

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Throws on text that is not base64. */
function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/**
 * The text the bytes encode as UTF-8. Throws (`URIError`) on bytes that are not valid UTF-8,
 * unlike `aesjs.utils.utf8.fromBytes`, which accepts them and also misreads four-byte characters.
 */
function fromUtf8(bytes: Uint8Array): string {
  let escaped = '';
  for (const byte of bytes) {
    escaped += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(escaped);
}

function cipher(key: Uint8Array, counter: Uint8Array): aesjs.ModeOfOperation.ModeOfOperationCTR {
  return new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(counter));
}

/** An object with `access_token` and `refresh_token` strings, as supabase-js stores a session. */
function isSession(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.access_token === 'string' && typeof record.refresh_token === 'string';
}

/** The value, or `null` when the halves do not decrypt to a session. Never throws. */
function decrypt(keyText: string, dataText: string): string | null {
  try {
    const material = fromBase64(keyText);
    if (material.length !== KEY_BYTES + COUNTER_BYTES) {
      return null;
    }
    const key = material.subarray(0, KEY_BYTES);
    const counter = material.subarray(KEY_BYTES);
    const text = fromUtf8(cipher(key, counter).decrypt(fromBase64(dataText)));
    return isSession(JSON.parse(text)) ? text : null;
  } catch {
    return null;
  }
}

async function removeBoth(name: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(name, STORE_OPTIONS),
    AsyncStorage.removeItem(name),
  ]);
}

function unreadable(keyText: string | null, dataText: string | null): Unreadable {
  if (keyText === null) {
    return 'missing_key';
  }
  return dataText === null ? 'missing_data' : 'undecodable';
}

async function getItem(name: string): Promise<string | null> {
  const [keyText, dataText] = await Promise.all([
    SecureStore.getItemAsync(name, STORE_OPTIONS),
    AsyncStorage.getItem(name),
  ]);
  if (keyText === null && dataText === null) {
    return null;
  }
  const value = keyText !== null && dataText !== null ? decrypt(keyText, dataText) : null;
  if (value === null) {
    logWarning('session_unreadable', { reason: unreadable(keyText, dataText) });
    await removeBoth(name);
  }
  return value;
}

async function setItem(name: string, value: string): Promise<void> {
  const key = randomBytes(KEY_BYTES);
  const counter = randomBytes(COUNTER_BYTES);
  const data = cipher(key, counter).encrypt(aesjs.utils.utf8.toBytes(value));
  const material = new Uint8Array(KEY_BYTES + COUNTER_BYTES);
  material.set(key);
  material.set(counter, KEY_BYTES);
  await Promise.all([
    SecureStore.setItemAsync(name, toBase64(material), STORE_OPTIONS),
    AsyncStorage.setItem(name, toBase64(data)),
  ]);
}

/** The session storage supabase-js takes as `auth.storage`; see the module comment. */
export const secureSession = { getItem, setItem, removeItem: removeBoth };
