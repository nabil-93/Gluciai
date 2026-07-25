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
  /** The patient closed the day; this is what unlocks the next one. */
  confirmDay: (date: string) => void;
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
            const next: ProgramDay = { ...d, workoutDoneAt: new Date().toISOString() };
            return { ...next, status: statusOf(next) };
          }),
        })),

      confirmDay: (date) =>
        set((s) => ({
          days: s.days.map((d) =>
            d.date !== date || d.confirmedAt
              ? d
              : { ...d, confirmedAt: new Date().toISOString(), status: 'done' }
          ),
        })),

      reset: () => set({ program: null, days: [], generating: false }),
    }),
    {
      name: 'glucoai-program',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
