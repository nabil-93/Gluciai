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
  LabReport,
  MealScan,
  MeasureLog,
  Profile,
} from '@/types';

/** One chat thread. Conversations are grouped locally on the device; the
 *  server keeps a single flat chat_history per patient (for the doctor). */
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updated_at: string;
}

/** First user line, trimmed, as the conversation's title. */
export function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')?.content?.trim();
  if (!firstUser) return '';
  const clean = firstUser.replace(/^🎙️\s*/, '').replace(/\s+/g, ' ');
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean;
}

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
  labReports: LabReport[];
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
  /** Chat threads, newest first; the active one is shown in the chat screen */
  conversations: Conversation[];
  activeConversationId: string | null;
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
  /** HIDDEN features explicitly granted to this account by the admin
   *  (feature_access allowed=true). Invisible everywhere unless granted. */
  grantedFeatures: string[];
  /** Reminders the patient asked the AI to set */
  aiReminders: AiReminder[];
  /** Account events (status changes, parameter edits) — part of the history */
  eventLogs: AppEvent[];
  /** Lab (blood test) reports photographed & analyzed by the AI */
  labReports: LabReport[];

  setLanguageChosen: () => void;
  setLockedFeatures: (features: string[]) => void;
  setGrantedFeatures: (features: string[]) => void;
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
  removeEventLog: (id: string) => void;

  addLabReport: (report: LabReport) => void;
  updateLabReport: (id: string, patch: Partial<LabReport>) => void;
  removeLabReport: (id: string) => void;

  addChatMessage: (message: ChatMessage) => void;
  updateLastChatMessage: (content: string) => void;
  /** Start a fresh empty conversation and make it active */
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
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
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  corrections: [] as FoodCorrection[],
  aiJournal: [] as AIJournalEntry[],
  aiJournalSeenAt: null as string | null,
  planWelcomeShown: false,
  lockedFeatures: [] as string[],
  grantedFeatures: [] as string[],
  aiReminders: [] as AiReminder[],
  eventLogs: [] as AppEvent[],
  labReports: [] as LabReport[],
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
      setGrantedFeatures: (grantedFeatures) => set({ grantedFeatures }),
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

      addLabReport: (report) =>
        set((s) => ({ labReports: [report, ...s.labReports] })),
      updateLabReport: (id, patch) =>
        set((s) => ({
          labReports: s.labReports.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),
      removeLabReport: (id) =>
        set((s) => ({ labReports: s.labReports.filter((r) => r.id !== id) })),

      addAiReminder: (reminder) =>
        set((s) => ({ aiReminders: [reminder, ...s.aiReminders] })),
      addEventLog: (event) =>
        set((s) => ({ eventLogs: [event, ...s.eventLogs].slice(0, 1000) })),
      removeEventLog: (id) =>
        set((s) => ({ eventLogs: s.eventLogs.filter((e) => e.id !== id) })),
      updateAiReminder: (id, patch) =>
        set((s) => ({
          aiReminders: s.aiReminders.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),

      addChatMessage: (message) =>
        set((s) => {
          const now = new Date().toISOString();
          // Find the active conversation; create one on the first message.
          let list = s.conversations;
          let activeId = s.activeConversationId;
          const idx = list.findIndex((c) => c.id === activeId);
          if (idx === -1) {
            const conv: Conversation = {
              id: `conv-${Date.now()}`,
              title: '',
              messages: [message],
              updated_at: now,
            };
            conv.title = titleFromMessages(conv.messages);
            return {
              conversations: [conv, ...list],
              activeConversationId: conv.id,
            };
          }
          const conv = list[idx];
          const messages = [...conv.messages, message];
          const updated: Conversation = {
            ...conv,
            messages,
            title: conv.title || titleFromMessages(messages),
            updated_at: now,
          };
          // Bump the touched conversation to the top.
          const rest = list.filter((_, i) => i !== idx);
          return { conversations: [updated, ...rest], activeConversationId: activeId };
        }),
      updateLastChatMessage: (content) =>
        set((s) => {
          const list = s.conversations.map((c) => {
            if (c.id !== s.activeConversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant') {
              messages[messages.length - 1] = { ...last, content };
            }
            return { ...c, messages };
          });
          return { conversations: list };
        }),
      newConversation: () =>
        set((s) => {
          // Reuse an already-empty active conversation instead of stacking blanks.
          const active = s.conversations.find(
            (c) => c.id === s.activeConversationId
          );
          if (active && active.messages.length === 0) return s;
          const conv: Conversation = {
            id: `conv-${Date.now()}`,
            title: '',
            messages: [],
            updated_at: new Date().toISOString(),
          };
          return {
            conversations: [conv, ...s.conversations],
            activeConversationId: conv.id,
          };
        }),
      selectConversation: (id) => set({ activeConversationId: id }),
      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          const activeConversationId =
            s.activeConversationId === id
              ? conversations[0]?.id ?? null
              : s.activeConversationId;
          return { conversations, activeConversationId };
        }),
      hydrateServer: (snapshot, switchedAccount) =>
        set((s) => {
          const { chatMessages: serverChat = [], ...rest } = snapshot;
          const base = switchedAccount
            ? {
                ...rest,
                corrections: [],
                aiJournal: [],
                aiJournalSeenAt: null,
                lockedFeatures: [],
                activityStatus: 'active' as ActivityStatus,
                planWelcomeShown: false,
              }
            : rest;
          // Seed conversations from the server's flat history only when we
          // have none yet (fresh login / new device) or when switching
          // accounts — never wipe locally-created threads on a routine open.
          let conversations = s.conversations;
          let activeConversationId = s.activeConversationId;
          if (switchedAccount || s.conversations.length === 0) {
            if (serverChat.length) {
              const conv: Conversation = {
                id: `conv-${Date.now()}`,
                title: titleFromMessages(serverChat),
                messages: serverChat,
                updated_at: new Date().toISOString(),
              };
              conversations = [conv];
              activeConversationId = conv.id;
            } else if (switchedAccount) {
              conversations = [];
              activeConversationId = null;
            }
          }
          return { ...base, conversations, activeConversationId };
        }),
      // Sign-out wipes the ACCOUNT (data + wizardDone/session), but keeps
      // device-level onboarding — language and the intro carousel — just like
      // `deviceOnboarded`. Otherwise a signed-out user routed through index
      // lands back on the language/onboarding intro instead of the login page.
      resetAll: () =>
        set((s) => ({
          ...initialData,
          languageChosen: s.languageChosen,
          onboardingDone: s.onboardingDone,
        })),
    }),
    {
      name: 'glucoai.store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
