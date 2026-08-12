/**
 * WHAT SHOULD A "GRANT ACCESS" BUTTON DO? — the decision, with no imports.
 *
 * Split out of ./permissions.ts, which has to import `Linking` from
 * react-native to actually open Settings. React Native's entry point is Flow,
 * not TypeScript, so anything importing it cannot be loaded by the node test
 * runner — and this rule is exactly the part that must be unit-tested. Same
 * reason `plausibility.ts`, `carbProvenance.ts` and `i18n/direction.ts` are
 * import-free leaves.
 *
 * Callers keep importing from '@/lib/permissions', which re-exports all of
 * this; nothing needs to know the file was split.
 */

/** What a "grant access" button should actually do. */
export type PermissionAction = 'request' | 'settings';

/**
 * The shape `useCameraPermissions()` returns, reduced to what the decision
 * needs. Declared structurally so this module imports nothing from expo.
 */
export interface PermissionLike {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Can the OS still be asked, or must the patient be sent to Settings?
 *
 * THE DEFECT THIS CLOSES (audit B-3). Every camera screen wired its button
 * straight to `requestPermission()`. That only opens the system prompt while
 * the OS is still willing to show it: once Android has recorded "Don't ask
 * again" — or iOS has recorded ANY denial, because iOS grants exactly one
 * prompt per permission for the life of the install — the call resolves
 * `denied` immediately and nothing visible happens. The patient taps a button
 * that does nothing, forever, with the scanner unreachable.
 *
 * Never reproduced on web, where the browser re-prompts every time.
 *
 * `null`/`undefined` (state not resolved yet) takes the `request` path: the
 * first tap must open the prompt, not the Settings app.
 *
 * A GRANTED permission also returns `request`. Callers gate on `granted`
 * before rendering any button, so the value is unused in that case — and
 * returning `settings` for a working permission would be a trap for the next
 * caller.
 */
export function permissionAction(
  permission: PermissionLike | null | undefined
): PermissionAction {
  if (!permission) return 'request';
  if (permission.granted) return 'request';
  return permission.canAskAgain ? 'request' : 'settings';
}
