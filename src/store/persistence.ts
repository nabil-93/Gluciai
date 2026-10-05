/**
 * HOW THE MAIN STORE IS WRITTEN TO THE DEVICE (store audit D-03).
 *
 * The whole account — every reading, meal, dose, conversation — was persisted
 * as ONE AsyncStorage value with no version and no bound. On Android that
 * value is one SQLite row in a database capped at 6 MB, and a row larger than
 * the 2 MB CursorWindow cannot be read back at all: for a patient with a long
 * history the next cold start would read nothing, i.e. the app would open
 * empty. Two independent fixes, both pure and unit-tested:
 *
 *  1. `persistedSlice` — the device keeps RECENT history only. The full
 *     history lives on the server and `hydrateFromServer` pulls it back into
 *     memory on every open; what is persisted is what the phone needs to work
 *     offline. A row the server does not have yet is ALWAYS kept, whatever its
 *     age — dropping it would lose it.
 *  2. `chunkedStorage` — the JSON is split across several keys, so no single
 *     row approaches the CursorWindow limit. A value written by the previous
 *     single-key format is still read.
 */

const DAY_MS = 86_400_000;

/** How much history the phone keeps between syncs, per list. */
export const PERSIST_WINDOW_DAYS = {
  glucoseLogs: 180,
  insulinLogs: 180,
  activityLogs: 180,
  measureLogs: 365,
  eventLogs: 90,
  meals: 90,
  labReports: 730,
} as const;

/** Bounds for lists that grow without a date of their own. */
export const PERSIST_MAX = {
  conversations: 30,
  messagesPerConversation: 200,
  aiJournal: 500,
  corrections: 300,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  created_at: string;
  pending_sync?: true;
}

/** Not (yet) on the server: flagged pending, or still carrying a local id. */
export function isUnsynced(row: { id: string; pending_sync?: true }): boolean {
  return row.pending_sync === true || !UUID_RE.test(row.id);
}

function recent<T extends Row>(rows: T[] | undefined, days: number, now: number): T[] {
  if (!Array.isArray(rows)) return [];
  const cutoff = now - days * DAY_MS;
  return rows.filter((r) => isUnsynced(r) || new Date(r.created_at).getTime() >= cutoff);
}

/**
 * The part of the store that is written to the device.
 *
 * Generic over the state shape so the store can pass itself without this
 * module importing it (no cycle). Functions are dropped by JSON anyway.
 */
export function persistedSlice<S extends Record<string, any>>(state: S, now: number): S {
  const s: Record<string, any> = { ...state };
  for (const [key, days] of Object.entries(PERSIST_WINDOW_DAYS)) {
    if (key in s) s[key] = recent(s[key], days, now);
  }
  // Report thumbnails are base64 images: the server keeps them, and they
  // come back with the next sync. Only an unsynced report keeps its own,
  // because the offline push sends it.
  if (Array.isArray(s.labReports)) {
    s.labReports = s.labReports.map((r: Row & { image_thumb?: string }) =>
      r.image_thumb && !isUnsynced(r) ? { ...r, image_thumb: undefined } : r
    );
  }
  if (Array.isArray(s.conversations)) {
    s.conversations = s.conversations
      .slice(0, PERSIST_MAX.conversations)
      .map((c: { messages?: unknown[] }) =>
        Array.isArray(c.messages) && c.messages.length > PERSIST_MAX.messagesPerConversation
          ? { ...c, messages: c.messages.slice(-PERSIST_MAX.messagesPerConversation) }
          : c
      );
  }
  if (Array.isArray(s.aiJournal)) s.aiJournal = s.aiJournal.slice(0, PERSIST_MAX.aiJournal);
  if (Array.isArray(s.corrections)) s.corrections = s.corrections.slice(0, PERSIST_MAX.corrections);
  return s as S;
}

/** Minimal async key-value contract (AsyncStorage satisfies it). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Characters per chunk — well under Android's 2 MB CursorWindow. */
export const CHUNK_SIZE = 400_000;
const HEADER = '__chunks:';

type Slot = 'a' | 'b';

/**
 * A KeyValueStore that writes a long value as chunks and keeps only a small
 * header (`__chunks:<n>:<slot>`) under `key` itself.
 *
 * Writes alternate between two chunk sets, `key#a#i` and `key#b#i`: the new
 * value goes into the set the header does NOT point at, then the header is
 * switched, then the old set is removed. If the app is killed mid-write the
 * header still points at the previous, complete set — the store reads the
 * last good state, never a mix. A value that is not a header (the previous
 * single-key format) is returned as is, so existing installs keep their data.
 */
export function chunkedStorage(
  base: KeyValueStore,
  chunkSize = CHUNK_SIZE,
  /** Between key, slot and index — SecureStore keys only allow [A-Za-z0-9._-]. */
  sep = '#'
): KeyValueStore {
  const chunkKey = (key: string, slot: Slot, i: number) => `${key}${sep}${slot}${sep}${i}`;
  const parse = (head: string | null): { n: number; slot: Slot } | null => {
    if (!head || !head.startsWith(HEADER)) return null;
    const [n, slot] = head.slice(HEADER.length).split(':');
    const count = Number(n);
    if (!Number.isInteger(count) || count < 0 || (slot !== 'a' && slot !== 'b')) return null;
    return { n: count, slot };
  };

  return {
    async getItem(key) {
      const head = await base.getItem(key);
      const h = parse(head);
      if (!h) return head; // nothing stored, or the old single-key format
      const parts: string[] = [];
      for (let i = 0; i < h.n; i++) {
        const part = await base.getItem(chunkKey(key, h.slot, i));
        if (part === null) return null; // incomplete set — treat as nothing stored
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const prev = parse(await base.getItem(key));
      const slot: Slot = prev?.slot === 'a' ? 'b' : 'a';
      const n = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let i = 0; i < n; i++) {
        await base.setItem(chunkKey(key, slot, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      await base.setItem(key, `${HEADER}${n}:${slot}`);
      if (prev) {
        for (let i = 0; i < prev.n; i++) await base.removeItem(chunkKey(key, prev.slot, i));
      }
    },
    async removeItem(key) {
      const h = parse(await base.getItem(key));
      if (h) for (let i = 0; i < h.n; i++) await base.removeItem(chunkKey(key, h.slot, i));
      await base.removeItem(key);
    },
  };
}
