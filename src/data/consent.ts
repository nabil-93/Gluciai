/* ── Consent conditions (GDPR-style, last step of account creation) ──
 * Shared by the wizard's consent step (checkbox cards) and the
 * /consent-detail page (full explanation per condition).
 *
 *  data   → health data is stored
 *  ai     → the AI assistant may read that data to personalize answers
 *  limits → AI output is suggestions only — it can be wrong; never a
 *           substitute for medical advice
 *  terms  → general terms of use & privacy policy
 */
export const CONSENT_IDS = ['data', 'ai', 'limits', 'terms'] as const;
export type ConsentId = (typeof CONSENT_IDS)[number];

export const CONSENT_META: Record<
  ConsentId,
  { icon: string; bg: string; accent: string }
> = {
  data: { icon: '🔒', bg: '#e4f4ec', accent: '#1fbc78' },
  ai: { icon: '🤖', bg: '#ece6fd', accent: '#8b5cf6' },
  limits: { icon: '⚠️', bg: '#fdf0d8', accent: '#e8930c' },
  terms: { icon: '📜', bg: '#e3edfd', accent: '#3b82f6' },
};
