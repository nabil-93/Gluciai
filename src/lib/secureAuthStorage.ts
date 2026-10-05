import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { chunkedStorage, type KeyValueStore } from '@/store/persistence';

/**
 * WHERE THE SIGN-IN SESSION LIVES ON A PHONE (store audit S-09).
 *
 * supabase-js was persisting the session — access token AND refresh token — in
 * AsyncStorage: a plain file / SQLite row any backup or rooted-device tool can
 * read, and the refresh token is a long-lived key to the patient's whole
 * medical record. It now lives in the iOS Keychain / Android Keystore through
 * expo-secure-store.
 *
 *  · Size: Android SecureStore warns above 2048 bytes and can fail to store a
 *    larger value; a session is ~1.5–3 KB. It is split into ≤ SECURE_CHUNK
 *    pieces with the same crash-safe two-slot scheme as the main store.
 *  · Existing installs: a session still in AsyncStorage is MOVED on first read,
 *    so nobody is signed out by this update.
 *  · A device whose keystore refuses (it happens on some Android builds after
 *    a lock-screen change) falls back to AsyncStorage rather than signing the
 *    patient out on every launch — less protected, never locked out.
 *
 * Native only: the web keeps supabase-js's default (localStorage).
 */

/** Below Android SecureStore's 2048-byte warning, with room for UTF-16 edge cases. */
export const SECURE_CHUNK = 1800;

export function makeSecureAuthStorage(
  secure: KeyValueStore,
  legacy: KeyValueStore
): KeyValueStore {
  const vault = chunkedStorage(secure, SECURE_CHUNK, '.');
  return {
    async getItem(key) {
      try {
        const v = await vault.getItem(key);
        if (v !== null) return v;
      } catch {
        // keystore unavailable — fall through to the legacy location
      }
      const old = await legacy.getItem(key);
      if (old !== null) {
        try {
          await vault.setItem(key, old);
          await legacy.removeItem(key);
        } catch {
          // keep it where it is; it is still readable from there
        }
      }
      return old;
    },
    async setItem(key, value) {
      try {
        await vault.setItem(key, value);
        // A stale copy must not outlive the move.
        await legacy.removeItem(key);
      } catch {
        await legacy.setItem(key, value);
      }
    },
    async removeItem(key) {
      try {
        await vault.removeItem(key);
      } catch {
        // nothing stored there, or the keystore is unavailable
      }
      await legacy.removeItem(key);
    },
  };
}

const secureStoreKV: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

const asyncStorageKV: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

/** The storage handed to supabase-js on iOS and Android. */
export const secureAuthStorage = makeSecureAuthStorage(secureStoreKV, asyncStorageKV);
