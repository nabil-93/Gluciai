import { isDemoMode, supabase } from '@/lib/supabase';

export interface HelpTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface HelpResult {
  reply: string;
  /** True when the assistant could not settle it — the screen then offers the
   *  human support channel instead of leaving the user stuck with a bot. */
  needsSupport: boolean;
  /** Up to 3 short follow-up questions the user can tap. */
  quickReplies: string[];
  /** What the assistant heard, when the turn was a voice note — shown back to
   *  the user so a mis-heard question is obvious rather than confusing. */
  transcript: string;
}

/** A voice note recorded in the chat (base64 + its mime type). */
export interface HelpAudio {
  mimeType: string;
  data: string;
}

/**
 * In-app help assistant ("how do I…" about GluciAI itself).
 *
 * Deliberately separate from the health chat: it runs the edge function's
 * `app_help` mode, which is not gated by the ai_chat lock or quota — someone
 * who has run out of chat messages must still be able to get help and reach
 * a human.
 */
export async function askAppHelp(
  messages: HelpTurn[],
  language: string,
  audio?: HelpAudio
): Promise<HelpResult> {
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 700));
    return {
      reply: 'Demo mode: the help assistant is unavailable without a backend.',
      needsSupport: true,
      quickReplies: [],
      transcript: '',
    };
  }

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { messages, language, mode: 'app_help', ...(audio ? { audio } : {}) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const r = data?.result ?? {};
  return {
    reply: typeof r.reply === 'string' ? r.reply : '',
    needsSupport: r.needsSupport === true,
    quickReplies: Array.isArray(r.quickReplies)
      ? r.quickReplies.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3)
      : [],
    transcript: typeof r.transcript === 'string' ? r.transcript : '',
  };
}
