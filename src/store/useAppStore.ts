import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ActivityLog,
  ActivityStatus,
  AIJournalEntry,
  AiReminder,
  AppEvent,
  ChatMessage,
  FoodCorrection,
  GlucoseLog,
  InsulinLog,
  MealScan,
  MeasureLog,
  Profile,
} from '@/types';

/** Everything hydrateFromServer() pulls back for the signed-in account. */
export interface ServerSnapshot {
  accountUserId: string;
  profile: Profile | null;
  glucoseLogs: GlucoseLog[];
  insulinLogs: InsulinLog[];
  meals: MealScan[];
  activityLogs: ActivityLog[];
  measureLogs: MeasureLog[];
  chatMessages: ChatMessage[];
  aiReminders: AiReminder[];
  eventLogs: AppEvent[];
}

interface AppState {
  // Flow flags
  languageChosen: boolean;
  onboardingDone: boolean;
  wizardDone: boolean;
  /** ISO timestamp the user accepted the terms/consent (account creation) */
  consentAcceptedAt: string | null;
  /** auth user the persisted data belongs to — guards account switches on a shared device */
  accountUserId: string | null;
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
  /** True once the "you're on the free plan" welcome has been shown */
  planWelcomeShown: boolean;
  /**
   * True after the very first launch on this device. Survives sign-out
   * (not part of `initialData`, so `resetAll` keeps it) so the auth screen
   * only defaults to "create account" the first time; afterwards it opens
   * straight on the login form.
   */
  deviceOnboarded: boolean;
  /** Features blocked for this account from the admin dashboard (feature_access) */
  lockedFeatures: string[];
  /** Reminders the patient asked the AI to set */
  aiReminders: AiReminder[];
  /** Account events (status changes, parameter edits) — part of the history */
  eventLogs: AppEvent[];

  setLanguageChosen: () => void;
  setLockedFeatures: (features: string[]) => void;
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
  markPlanWelcomeShown: () => void;
  markDeviceOnboarded: () => void;

  addAiReminder: (reminder: AiReminder) => void;
  updateAiReminder: (id: string, patch: Partial<AiReminder>) => void;
  addEventLog: (event: AppEvent) => void;

  addChatMessage: (message: ChatMessage) => void;
  updateLastChatMessage: (content: string) => void;
  /**
   * Replace local data with the account's server snapshot (server = source
   * of truth). `switchedAccount` additionally wipes device-only leftovers
   * (AI journal, corrections…) belonging to the previous account.
   */
  hydrateServer: (snapshot: ServerSnapshot, switchedAccount: boolean) => void;
  resetAll: () => void;
}

const initialData = {
  languageChosen: false,
  onboardingDone: false,
  wizardDone: false,
  consentAcceptedAt: null as string | null,
  accountUserId: null as string | null,
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
  planWelcomeShown: false,
  lockedFeatures: [] as string[],
  aiReminders: [] as AiReminder[],
  eventLogs: [] as AppEvent[],
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialData,
      // Device-level, deliberately outside `initialData` so `resetAll`
      // (sign-out) never flips it back — a returning user keeps landing on
      // the login form, not the sign-up form.
      deviceOnboarded: false,
      markDeviceOnboarded: () => set({ deviceOnboarded: true }),
      setLanguageChosen: () => set({ languageChosen: true }),
      setLockedFeatures: (lockedFeatures) => set({ lockedFeatures }),
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
      markPlanWelcomeShown: () => set({ planWelcomeShown: true }),

      addAiReminder: (reminder) =>
        set((s) => ({ aiReminders: [reminder, ...s.aiReminders] })),
      addEventLog: (event) =>
        set((s) => ({ eventLogs: [event, ...s.eventLogs].slice(0, 1000) })),
      updateAiReminder: (id, patch) =>
        set((s) => ({
          aiReminders: s.aiReminders.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),

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
      hydrateServer: (snapshot, switchedAccount) =>
        set(
          switchedAccount
            ? {
                ...snapshot,
                corrections: [],
                aiJournal: [],
                aiJournalSeenAt: null,
                lockedFeatures: [],
                activityStatus: 'active',
                planWelcomeShown: false,
              }
            : snapshot
        ),
      resetAll: () => set({ ...initialData }),
    }),
    {
      name: 'glucoai.store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
