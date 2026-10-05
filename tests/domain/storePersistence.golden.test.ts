import { describe, expect, it } from 'vitest';

import {
  chunkedStorage,
  isUnsynced,
  persistedSlice,
  PERSIST_MAX,
  type KeyValueStore,
} from '@/store/persistence';

/**
 * Store audit D-03 — what the main store writes to the device, and how.
 * See src/store/persistence.ts for the failure this prevents (an Android row
 * over the 2 MB CursorWindow cannot be read back: the app opens empty).
 */

const NOW = Date.UTC(2026, 9, 5, 12);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function memoryStore() {
  const map = new Map<string, string>();
  const kv: KeyValueStore = {
    getItem: async (k) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
  return { map, kv };
}

describe('persistedSlice — recent history on the phone, the rest on the server', () => {
  it('drops synced rows older than the window, keeps recent ones', () => {
    const state = {
      glucoseLogs: [
        { id: uuid(1), created_at: daysAgo(1), value: 110 },
        { id: uuid(2), created_at: daysAgo(400), value: 140 },
      ],
    };
    const out = persistedSlice(state, NOW);
    expect(out.glucoseLogs.map((g) => g.id)).toEqual([uuid(1)]);
  });

  it('NEVER drops a row the server does not have, however old', () => {
    const state = {
      insulinLogs: [
        { id: 'local-123', created_at: daysAgo(500), dose: 4 },
        { id: uuid(3), created_at: daysAgo(500), dose: 5, pending_sync: true as const },
      ],
    };
    const out = persistedSlice(state, NOW);
    expect(out.insulinLogs).toHaveLength(2);
  });

  it('strips synced report thumbnails, keeps an unsynced report’s own', () => {
    const state = {
      labReports: [
        { id: uuid(4), created_at: daysAgo(2), values: [], image_thumb: 'AAAA' },
        { id: 'local-lab', created_at: daysAgo(2), values: [], image_thumb: 'BBBB' },
      ],
    };
    const out = persistedSlice(state, NOW);
    expect(out.labReports[0].image_thumb).toBeUndefined();
    expect(out.labReports[1].image_thumb).toBe('BBBB');
  });

  it('bounds conversations and their messages', () => {
    const conv = (i: number) => ({
      id: `c${i}`,
      title: '',
      updated_at: daysAgo(0),
      messages: Array.from({ length: 250 }, (_, j) => ({ id: `${i}-${j}` })),
    });
    const out = persistedSlice(
      { conversations: Array.from({ length: 40 }, (_, i) => conv(i)) },
      NOW
    );
    expect(out.conversations).toHaveLength(PERSIST_MAX.conversations);
    expect(out.conversations[0].messages).toHaveLength(PERSIST_MAX.messagesPerConversation);
    // The most recent messages are the ones kept.
    expect(out.conversations[0].messages.at(-1)).toEqual({ id: '0-249' });
  });

  it('leaves every other field untouched', () => {
    const state = { wizardDone: true, profile: { name: 'Salma' }, pendingDeletes: [{ id: 'x' }] };
    expect(persistedSlice(state, NOW)).toEqual(state);
  });

  it('local ids count as unsynced', () => {
    expect(isUnsynced({ id: '1753900000000-abc' })).toBe(true);
    expect(isUnsynced({ id: uuid(9) })).toBe(false);
  });
});

describe('chunkedStorage — no single row near the CursorWindow limit', () => {
  it('round-trips a value larger than one chunk', async () => {
    const { map, kv } = memoryStore();
    const store = chunkedStorage(kv, 10);
    const value = 'x'.repeat(35);
    await store.setItem('k', value);
    expect(await store.getItem('k')).toBe(value);
    // 4 chunks + 1 header, none above the chunk size.
    expect([...map.keys()].filter((k) => k.startsWith('k#'))).toHaveLength(4);
    for (const [k, v] of map) if (k !== 'k') expect(v.length).toBeLessThanOrEqual(10);
  });

  it('reads the previous single-key format unchanged', async () => {
    const { kv } = memoryStore();
    await kv.setItem('k', '{"state":{"wizardDone":true},"version":0}');
    expect(await chunkedStorage(kv, 10).getItem('k')).toBe(
      '{"state":{"wizardDone":true},"version":0}'
    );
  });

  it('a rewrite leaves no stale chunks behind', async () => {
    const { map, kv } = memoryStore();
    const store = chunkedStorage(kv, 10);
    await store.setItem('k', 'a'.repeat(50));
    await store.setItem('k', 'b'.repeat(12));
    expect(await store.getItem('k')).toBe('b'.repeat(12));
    expect([...map.keys()].filter((k) => k.startsWith('k#'))).toHaveLength(2);
  });

  it('an interrupted write still reads the last complete value', async () => {
    const { kv } = memoryStore();
    const store = chunkedStorage(kv, 10);
    await store.setItem('k', 'old-value-'.repeat(3));
    // Simulate a kill after the new chunks were written but before the header
    // moved: write chunks into the other slot by hand, header untouched.
    await kv.setItem('k#b#0', 'NEW-NEW-NE');
    await kv.setItem('k#b#1', 'W-');
    expect(await store.getItem('k')).toBe('old-value-'.repeat(3));
  });

  it('removeItem clears the header and every chunk', async () => {
    const { map, kv } = memoryStore();
    const store = chunkedStorage(kv, 10);
    await store.setItem('k', 'z'.repeat(25));
    await store.removeItem('k');
    expect(map.size).toBe(0);
  });
});
