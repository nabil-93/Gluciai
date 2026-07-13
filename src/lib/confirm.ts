import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * React Native's `Alert.alert` renders NO actionable buttons on web
 * (react-native-web ignores the button array, so the `onPress` callbacks
 * never fire) — which is why "Se déconnecter" looked dead in the PWA. On
 * web we fall back to the browser's native `confirm()`; on native we use
 * the real `Alert`. Resolves `true` when the user confirms.
 */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel, cancelLabel, destructive } = opts;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(text)
        : true;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Cross-platform one-button notice (web `alert`, native `Alert.alert`). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
