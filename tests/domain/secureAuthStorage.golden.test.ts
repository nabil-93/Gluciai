import { describe, expect, it, vi } from 'vitest';

import type { KeyValueStore } from '@/store/persistence';

/**
 * Store audit S-09 — the session moves from AsyncStorage to the Keychain /
 * Keystore. The real native modules cannot run here; the adapter is built from
 * two in-memory stores so its rules are tested exactly.
 */

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const { makeSecureAuthStorage, SECURE_CHUNK } = await import('@/lib/secureAuthStorage');

const KEY = 'sb-ref-auth-token';
const SESSION = JSON.stringify({ access_token: 'a'.repeat(1200), refresh_token: 'r'.repeat(900) });

function kv(opts: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: async (k) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k, v) => {
      if (opts.failWrites) throw new Error('keystore unavailable');
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
  return { map, store };
}

describe('the session lives in the secure store', () => {
  it('is written there, in pieces under the SecureStore size limit', async () => {
    const secure = kv();
    const legacy = kv();
    const s = makeSecureAuthStorage(secure.store, legacy.store);
    await s.setItem(KEY, SESSION);
    expect(await s.getItem(KEY)).toBe(SESSION);
    expect(legacy.map.size).toBe(0);
    for (const [k, v] of secure.map) {
      expect(k, k).toMatch(/^[A-Za-z0-9._-]+$/); // SecureStore key alphabet
      expect(v.length).toBeLessThanOrEqual(SECURE_CHUNK);
    }
  });

  it('an existing install is not signed out: the old session is moved on first read', async () => {
    const secure = kv();
    const legacy = kv();
    legacy.map.set(KEY, SESSION);
    const s = makeSecureAuthStorage(secure.store, legacy.store);
    expect(await s.getItem(KEY)).toBe(SESSION);
    expect(legacy.map.has(KEY)).toBe(false);
    expect(await s.getItem(KEY)).toBe(SESSION); // now from the secure store
  });

  it('a refusing keystore falls back instead of locking the patient out', async () => {
    const secure = kv({ failWrites: true });
    const legacy = kv();
    const s = makeSecureAuthStorage(secure.store, legacy.store);
    await s.setItem(KEY, SESSION);
    expect(await s.getItem(KEY)).toBe(SESSION);
    expect(legacy.map.get(KEY)).toBe(SESSION);
  });

  it('sign-out removes it from both places', async () => {
    const secure = kv();
    const legacy = kv();
    const s = makeSecureAuthStorage(secure.store, legacy.store);
    await s.setItem(KEY, SESSION);
    legacy.map.set(KEY, 'stale');
    await s.removeItem(KEY);
    expect(secure.map.size).toBe(0);
    expect(legacy.map.size).toBe(0);
    expect(await s.getItem(KEY)).toBeNull();
  });
});
