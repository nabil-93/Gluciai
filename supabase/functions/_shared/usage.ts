// Shared helper: log the EXACT Gemini token usage (usageMetadata) per user.
// Prices are Google's published rates (ai.google.dev/gemini-api/docs/pricing),
// USD per 1M tokens. Logging is best-effort and never breaks the main request.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** gemini-2.5-flash: $0.30 in (text/image), $1.00 in (audio), $2.50 out —
 *  per 1M tokens. */
export const FLASH_IN_PER_M = 0.3;
export const FLASH_AUDIO_IN_PER_M = 1.0;
export const FLASH_OUT_PER_M = 2.5;

/** Resolve the calling user's id from the request JWT (null if anonymous). */
export async function callerUserId(req: Request): Promise<string | null> {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt || !SUPABASE_URL || !SERVICE_KEY) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

/** Insert one ai_usage row (service role, bypasses RLS). */
export async function logUsage(row: {
  user_id: string;
  kind: 'chat' | 'voice' | 'scan' | 'bolus' | 'lab';
  model: string;
  input_tokens: number;
  output_tokens: number;
  audio_input_tokens?: number;
  cost_usd: number;
}): Promise<void> {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  } catch {
    // usage logging must never break the request
  }
}

/** Cost of a gemini-2.5-flash call, from exact token counts. Audio input
 *  tokens (voice notes) are billed at their own rate. */
export function flashCost(
  inputTokens: number,
  outputTokens: number,
  audioInputTokens = 0
): number {
  return (
    ((inputTokens - audioInputTokens) * FLASH_IN_PER_M +
      audioInputTokens * FLASH_AUDIO_IN_PER_M +
      outputTokens * FLASH_OUT_PER_M) /
    1_000_000
  );
}
