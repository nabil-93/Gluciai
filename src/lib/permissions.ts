import { Linking } from 'react-native';

import { permissionAction, type PermissionLike } from './permissionAction';

/**
 * RECOVERING FROM A DENIED PERMISSION — the platform half (audit finding B-3).
 *
 * The DECISION lives in ./permissionAction.ts, which imports nothing so it can
 * be unit-tested in a plain node environment. This file is only the part that
 * has to touch the platform, and it re-exports the pure half so every call site
 * keeps a single import.
 *
 * `Linking.openSettings()` appeared nowhere in this codebase before B-3 — which
 * is why a camera permission denied once left the scanner permanently
 * unreachable behind a button that silently did nothing.
 */

export { permissionAction } from './permissionAction';
export type { PermissionAction, PermissionLike } from './permissionAction';

/** Open this app's page in the OS settings. Never throws. */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Some OEM builds expose no settings intent. There is nothing useful to
    // fall back to, and "the button did nothing" is the state we are leaving,
    // so this is swallowed rather than surfaced as a second dead end.
  }
}

/**
 * Ask for the permission, or send the patient to Settings when asking can no
 * longer work.
 *
 * @param permission        current state from `useCameraPermissions()`
 * @param requestPermission the requester that hook returns
 */
export async function requestOrOpenSettings(
  permission: PermissionLike | null | undefined,
  requestPermission: () => Promise<unknown>
): Promise<void> {
  if (permissionAction(permission) === 'settings') {
    await openAppSettings();
    return;
  }
  await requestPermission();
}
