import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NutritionSource } from '@/types';
import type { ProviderHit } from './types';

/**
 * Smart match cache — remembers which provider hit a given `search_name`
 * so repeat scans skip the network entirely.
 *
 *   "salmon" → USDA match  ──cache──▶  next "salmon" scan loads instantly
 *
 * • Key: normalized search_name (lowercased, trimmed).
 * • Storage: AsyncStorage (survives app restarts), mirrored in an in-memory
 *   map for zero-latency reads within a session.
 * • Invalidation: bump CACHE_VERSION when the nutrition databases/providers
 *   change — every old entry is then ignored and lazily overwritten.
 *
 * The cache stores only successful hits; misses are never cached (so a food
 * absent today can still be found once a provider improves).
 */

/** Bump this whenever provider data/logic changes to invalidate all entries. */
const CACHE_VERSION = 1;
const STORAGE_KEY = `nutrition-match-cache:v${CACHE_VERSION}`;
/** Entries older than this are treated as stale (30 days). */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Cap the number of cached foods to keep storage small. */
const MAX_ENTRIES = 400;

interface CacheEntry {
  hit: ProviderHit;
  source: NutritionSource;
  savedAt: number;
}

let memory: Map<string, CacheEntry> | null = null;
let loadPromise: Promise<void> | null = null;

function keyOf(searchName: string): string {
  return searchName.trim().toLowerCase();
}

/** Load the persisted cache into memory once (idempotent). */
async function ensureLoaded(): Promise<void> {
  if (memory) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      memory = new Map();
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const obj = JSON.parse(raw) as Record<string, CacheEntry>;
          const now = Date.now();
          for (const [k, v] of Object.entries(obj)) {
            if (v && now - v.savedAt < MAX_AGE_MS) memory!.set(k, v);
          }
        }
      } catch {
        // Corrupt/missing cache → start empty (never blocks a scan).
      }
    })();
  }
  await loadPromise;
}

/** Look up a cached hit for a search term (null on miss/stale). */
export async function getCachedMatch(
  searchName: string
): Promise<ProviderHit | null> {
  await ensureLoaded();
  const entry = memory!.get(keyOf(searchName));
  if (!entry) return null;
  if (Date.now() - entry.savedAt >= MAX_AGE_MS) {
    memory!.delete(keyOf(searchName));
    return null;
  }
  return entry.hit;
}

/** Persist a successful match. Fire-and-forget; failures are ignored. */
export async function setCachedMatch(
  searchName: string,
  hit: ProviderHit
): Promise<void> {
  await ensureLoaded();
  memory!.set(keyOf(searchName), {
    hit,
    source: hit.source,
    savedAt: Date.now(),
  });
  // Trim oldest entries if we exceed the cap.
  if (memory!.size > MAX_ENTRIES) {
    const sorted = [...memory!.entries()].sort(
      (a, b) => a[1].savedAt - b[1].savedAt
    );
    for (let i = 0; i < sorted.length - MAX_ENTRIES; i++) {
      memory!.delete(sorted[i][0]);
    }
  }
  persist();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced write so a burst of matches costs one AsyncStorage write. */
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!memory) return;
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of memory) obj[k] = v;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj)).catch(() => {});
  }, 400);
}

/** Manually clear the whole cache (e.g. a "refresh nutrition data" action). */
export async function clearMatchCache(): Promise<void> {
  memory = new Map();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
