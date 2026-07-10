import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ActivityLog,
  ActivityStatus,
  AIJournalEntry,
  ChatMessage,
  FoodCorrection,
  GlucoseLog,
  InsulinLog,
  MealScan,
  MeasureLog,
  Profile,
} from '@/types';

interface AppState {
  // Flow flags
  languageChosen: boolean;
  onboardingDone: boolean;
  wizardDone: boolean;
  /** ISO timestamp the user accepted the terms/consent (account creation) */
  consentAcceptedAt: string | null;
  // User
  profile: Profile | null;
  activityStatus: ActivityStatus;
  // Local-first data (also mirrored to Supabase when configured)
  glucoseLogs: GlucoseLog[];
  insulinLogs: InsulinLog[];
  meals: MealScan[];
  activityLogs: ActivityLog[];
  measureLogs: MeasureLog[];
  chatMessages: ChatMessage[];
  /** AI learning: user corrections, stored apart from official values */
  corrections: FoodCorrection[];
  /** AI coach journal: everything the assistant detected, in order */
  aiJournal: AIJournalEntry[];
  /** ISO timestamp the user last opened the notifications (AI journal) screen */
  aiJournalSeenAt: string | null;

  setLanguageChosen: () => void;
  setOnboardingDone: () => void;
  setWizardDone: () => void;
  setConsentAccepted: () => void;
  setProfile: (profile: Profile) => void;
  setActivityStatus: (status: ActivityStatus) => void;

  addGlucoseLog: (log: GlucoseLog) => void;
  removeGlucoseLog: (id: string) => void;
  addInsulinLog: (log: InsulinLog) => void;
  removeInsulinLog: (id: string) => void;
  addMeal: (meal: MealScan) => void;
  removeMeal: (id: string) => void;
  addActivityLog: (log: ActivityLog) => void;
  removeActivityLog: (id: string) => void;
  addMeasureLog: (log: MeasureLog) => void;
  removeMeasureLog: (id: string) => void;
  addCorrection: (correction: FoodCorrection) => void;
  addAiJournalEntry: (entry: AIJournalEntry) => void;
  /** Mark the notifications screen as read (clears the unread badge) */
  markAiJournalSeen: () => void;

  addChatMessage: (message: ChatMessage) => void;
  updateLastChatMessage: (content: string) => void;
  resetAll: () => void;
}

const initialData = {
  languageChosen: false,
  onboardingDone: false,
  wizardDone: false,
  consentAcceptedAt: null as string | null,
  profile: null,
  activityStatus: 'active' as ActivityStatus,
  glucoseLogs: [] as GlucoseLog[],
  insulinLogs: [] as InsulinLog[],
  meals: [] as MealScan[],
  activityLogs: [] as ActivityLog[],
  measureLogs: [] as MeasureLog[],
  chatMessages: [] as ChatMessage[],
  corrections: [] as FoodCorrection[],
  aiJournal: [] as AIJournalEntry[],
  aiJournalSeenAt: null as string | null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialData,
      setLanguageChosen: () => set({ languageChosen: true }),
      setOnboardingDone: () => set({ onboardingDone: true }),
      setWizardDone: () => set({ wizardDone: true }),
      setConsentAccepted: () =>
        set({ consentAcceptedAt: new Date().toISOString() }),
      setProfile: (profile) => set({ profile }),
      setActivityStatus: (activityStatus) => set({ activityStatus }),

      addGlucoseLog: (log) =>
        set((s) => ({ glucoseLogs: [log, ...s.glucoseLogs] })),
      removeGlucoseLog: (id) =>
        set((s) => ({ glucoseLogs: s.glucoseLogs.filter((l) => l.id !== id) })),
      addInsulinLog: (log) =>
        set((s) => ({ insulinLogs: [log, ...s.insulinLogs] })),
      removeInsulinLog: (id) =>
        set((s) => ({ insulinLogs: s.insulinLogs.filter((l) => l.id !== id) })),
      addMeal: (meal) => set((s) => ({ meals: [meal, ...s.meals] })),
      removeMeal: (id) =>
        set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),
      addActivityLog: (log) =>
        set((s) => ({ activityLogs: [log, ...s.activityLogs] })),
      removeActivityLog: (id) =>
        set((s) => ({
          activityLogs: s.activityLogs.filter((l) => l.id !== id),
        })),
      addMeasureLog: (log) =>
        set((s) => ({ measureLogs: [log, ...s.measureLogs] })),
      removeMeasureLog: (id) =>
        set((s) => ({
          measureLogs: s.measureLogs.filter((l) => l.id !== id),
        })),
      addCorrection: (correction) =>
        set((s) => ({
          // keep the 200 most recent corrections
          corrections: [correction, ...s.corrections].slice(0, 200),
        })),
      addAiJournalEntry: (entry) =>
        set((s) => {
          // Dedup: skip if the latest entry is the same detection
          const last = s.aiJournal[0];
          if (last && last.title === entry.title && last.tone === entry.tone) {
            return s;
          }
          return { aiJournal: [entry, ...s.aiJournal].slice(0, 300) };
        }),
      markAiJournalSeen: () =>
        set({ aiJournalSeenAt: new Date().toISOString() }),

      addChatMessage: (message) =>
        set((s) => ({ chatMessages: [...s.chatMessages, message] })),
      updateLastChatMessage: (content) =>
        set((s) => {
          const messages = [...s.chatMessages];
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content };
          }
          return { chatMessages: messages };
        }),
      resetAll: () => set({ ...initialData }),
    }),
    {
      name: 'glucoai.store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
