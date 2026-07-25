import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Program, ProgramDay } from '@/services/program';

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
  /** Mark one meal of a day as actually eaten. */
  markEaten: (date: string, slot: string) => void;
  reset: () => void;
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

      markEaten: (date, slot) =>
        set((s) => ({
          days: s.days.map((d) =>
            d.date !== date
              ? d
              : {
                  ...d,
                  meals: d.meals.map((m) =>
                    m.slot !== slot ? m : { ...m, eatenAt: new Date().toISOString() }
                  ),
                  status: 'partial',
                }
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
