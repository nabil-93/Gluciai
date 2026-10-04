/**
 * Public web addresses the app links to — one place, so the store listings,
 * the auth e-mails and the screens never disagree.
 *
 * WEB_APP_URL is the production web build (Vercel). It also hosts the pages a
 * phone opens from an e-mail (password reset), because a link in an e-mail is
 * an https URL, not an app deep link.
 */
export const WEB_APP_URL = 'https://gluciai.vercel.app';

/** Where the password-reset e-mail sends the patient (must be allow-listed in
 *  Supabase → Authentication → URL Configuration → Redirect URLs). */
export const PASSWORD_RESET_URL = `${WEB_APP_URL}/reset-password`;

/** Public privacy policy (store listings + in-app Profil → Confidentialité). */
export const PRIVACY_URL = `${WEB_APP_URL}/privacy`;

/** Public account-deletion page — Google Play requires a web URL where a user
 *  can delete their account without installing the app (store audit B-10). */
export const DELETE_ACCOUNT_URL = `${WEB_APP_URL}/delete-account`;

/*
 * THE DATA CONTROLLER NAMED IN THE PRIVACY POLICY — TO BE FILLED BY THE OWNER.
 *
 * A privacy policy must say who is responsible for the data and how to reach
 * them (GDPR art. 13, Moroccan law 09-08, Apple 5.1.1(i)). These are the
 * owner's legal name (person or company) and a contact e-mail. While empty,
 * the policy names "GluciAI" and points to the WhatsApp support line instead.
 */
export const LEGAL_OWNER = '';
export const LEGAL_CONTACT_EMAIL = '';

/** Date shown as "last updated" on the privacy policy. */
export const POLICY_UPDATED = '2026-10-04';
