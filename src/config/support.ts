/**
 * Support channel configuration — the ONE place the support number lives.
 *
 * It used to be copy-pasted as a local `SUPPORT_WA` const in five different
 * files (subscription, usage-limits, AppAlert, PlanWelcome, LockedFeature),
 * which meant changing it required finding all five. They all import it from
 * here now.
 *
 * Digits only, full international format — wa.me rejects '+', spaces and
 * dashes (e.g. +49 163 760 6478 -> '491637606478').
 */
export const SUPPORT_WHATSAPP = '491637606478';

/** Prefilled first message, so the user does not start from a blank chat. */
export const SUPPORT_WHATSAPP_GREETING = 'Bonjour, j’ai besoin d’aide avec GlucoAI.';

export const hasWhatsappSupport = () => SUPPORT_WHATSAPP.trim().length > 0;

/** wa.me deep link with the greeting pre-filled. */
export function whatsappUrl(message = SUPPORT_WHATSAPP_GREETING): string {
  return `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
