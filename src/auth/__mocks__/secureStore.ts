// Stands in for expo-secure-store in tests: `apps/mobile/jest.config.js` maps the package name to
// this file. The real store is the iOS keychain (Android keystore), a native module Jest cannot
// load. This one keeps the items in memory, records the options of every call through `jest.fn`,
// and exports `secureStoreItems` so a test can read or change what is stored.

/** Any number: the real value is the keychain's own constant, read only by the native module. */
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;

/** The stored items by name. Tests clear it between cases. */
export const secureStoreItems = new Map<string, string>();

export const getItemAsync = jest.fn((key: string) =>
  Promise.resolve(secureStoreItems.get(key) ?? null),
);

export const setItemAsync = jest.fn((key: string, value: string) => {
  secureStoreItems.set(key, value);
  return Promise.resolve();
});

export const deleteItemAsync = jest.fn((key: string) => {
  secureStoreItems.delete(key);
  return Promise.resolve();
});
