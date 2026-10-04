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
