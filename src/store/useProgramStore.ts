import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PlannedMeal, Program, ProgramDay } from '@/services/program';

/* ────────────────────────────────────────────────────────────
 * "Mon Programme" state, deliberately kept in its OWN store rather than
 * folded into useAppStore. The feature is on trial: if it is dropped,
 * deleting this file removes every trace of it from the app's state, with
 * no risk of disturbing the glucose / insulin / meal data that the rest of
 * the app depends on.
 * ──────────────────────────────────────────────────────────── */

interface ProgramState {
  /**
   * The auth user this persisted parcours belongs to.
   *
   * Without it, a phone shared between accounts (a family, a doctor showing
   * the app, one person with two logins) showed EVERY account the first
   * account's program — someone else's meals, someone else's carb budget,
   * feeding someone else's insulin doses. The parcours is medical data: it
   * is owned, and it never crosses an account boundary.
   */
  accountUserId: string | null;
  program: Program | null;
  days: ProgramDay[];
  /** Set while the coach is composing the plan. */
  generating: boolean;
  setProgram: (p: Program | null) => void;
  setDays: (d: ProgramDay[]) => void;
  upsertDay: (d: ProgramDay) => void;
  setGenerating: (v: boolean) => void;
  /**
   * Record what the patient did with one planned meal — eaten, with the
   * journal entry it produced and the portion they actually had.
   */
  patchMeal: (date: string, slot: string, patch: Partial<PlannedMeal>) => void;
  /** The day's session was completed. */
  markWorkoutDone: (date: string) => void;
  /** The patient could not train today — the day may still be closed. */
  skipWorkout: (date: string) => void;
  /** Swap the day's session (a different place, or simply another one). */
  setDayWorkout: (date: string, workoutId: string | null) => void;
  /** The patient closed the day; this is what unlocks the next one. */
  confirmDay: (date: string) => void;
  /**
   * Claim the persisted parcours for `uid`, wiping it if it belonged to
   * anybody else. Call it before reading the store on any screen and on
   * every sign-in / sign-out — it is the guard, not a convenience.
   */
  adoptUser: (uid: string | null) => void;
  reset: () => void;
}

/** planned → partial → done, derived from the meals rather than declared. */
function statusOf(d: ProgramDay): ProgramDay['status'] {
  if (d.confirmedAt) return 'done';
  return d.meals.some((m) => m.eatenAt) || d.workoutDoneAt ? 'partial' : 'planned';
}

export const useProgramStore = create<ProgramState>()(
  persist(
    (set) => ({
      accountUserId: null,
      program: null,
      days: [],
      generating: false,

      setProgram: (program) => set({ program }),
      setDays: (days) => set({ days }),
      upsertDay: (d) =>
        set((s) => ({
          days: [...s.days.filter((x) => x.date !== d.date), d].sort((a, b) =>
            a.date.localeCompare(b.date)
          ),
        })),
      setGenerating: (generating) => set({ generating }),

      patchMeal: (date, slot, patch) =>
        set((s) => ({
          days: s.days.map((d) => {
            if (d.date !== date) return d;
            const next: ProgramDay = {
              ...d,
              meals: d.meals.map((m) => (m.slot !== slot ? m : { ...m, ...patch })),
            };
            return { ...next, status: statusOf(next) };
          }),
        })),

      markWorkoutDone: (date) =>
        set((s) => ({
          days: s.days.map((d) => {
            if (d.date !== date || d.workoutDoneAt) return d;
            const next: ProgramDay = {
              ...d,
              workoutDoneAt: new Date().toISOString(),
              workoutSkippedAt: null,
            };
            return { ...next, status: statusOf(next) };
          }),
        })),

      skipWorkout: (date) =>
        set((s) => ({
          days: s.days.map((d) =>
            d.date !== date || d.workoutDoneAt
              ? d
              : { ...d, workoutSkippedAt: new Date().toISOString() }
          ),
        })),

      setDayWorkout: (date, workoutId) =>
        set((s) => ({
          days: s.days.map((d) =>
            // Swapping is only meaningful while the session is still ahead —
            // rewriting a session already trained would falsify the history.
            d.date !== date || d.workoutDoneAt
              ? d
              : { ...d, workoutId, workoutSkippedAt: null }
          ),
        })),

      confirmDay: (date) =>
        set((s) => ({
          days: s.days.map((d) => {
            if (d.date !== date || d.confirmedAt) return d;
            // A day closed with meals missed or the session skipped is
            // recorded as "skipped", not "done". The patient's history has to
            // be able to tell a finished day from a settled one.
            const ateAll = d.meals.length > 0 && d.meals.every((m) => m.eatenAt);
            const trained = !d.workoutId || !!d.workoutDoneAt;
            return {
              ...d,
              confirmedAt: new Date().toISOString(),
              status: ateAll && trained ? 'done' : 'skipped',
            };
          }),
        })),

      adoptUser: (uid) =>
        set((s) => {
          if (s.accountUserId === uid) return s;
          // Anything already here belongs to someone else — or to an owner we
          // cannot name, which is no better. Both cases wipe. A parcours that
          // really belongs to this user is re-read from the server by
          // `loadProgram()` immediately afterwards; nothing real is lost.
          return { accountUserId: uid, program: null, days: [], generating: false };
        }),

      reset: () => set({ program: null, days: [], generating: false }),
    }),
    {
      name: 'glucoai-program',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
