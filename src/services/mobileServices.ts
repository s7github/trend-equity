/**
 * Mobile Services — push notifications + biometric auth for Capacitor/native.
 *
 * All functions degrade gracefully on platforms where the underlying API
 * isn't available (web browser without Capacitor, older devices, etc.).
 */

import { PushNotifications } from '@capacitor/push-notifications';

/** Result of a biometric authentication attempt. */
export interface BiometricResult {
  success: boolean;
  error?: string;
}

/** Result of push notification registration. */
export interface PushRegistration {
  registered: boolean;
  token?: string;
  error?: string;
}

/**
 * Check if biometric authentication is available on this device.
 * Uses the WebAuthn API (PublicKeyCredential) which is supported on
 * iOS Safari, Android Chrome, and Capacitor webviews.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    return Boolean(
      window.PublicKeyCredential &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/**
 * Perform biometric authentication via WebAuthn (platform authenticator).
 * Returns success/failure. On unsupported browsers, resolves with success=false.
 */
export async function authenticateBiometric(): Promise<BiometricResult> {
  const available = await isBiometricAvailable();
  if (!available) {
    return { success: false, error: 'Biometric authentication not available on this device.' };
  }

  try {
    // Use WebAuthn get() to authenticate with a platform authenticator (Touch ID, Face ID, fingerprint)
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32), // In production, fetch a real challenge from the server
        allowCredentials: [],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return { success: !!credential };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Biometric authentication failed.',
    };
  }
}

/**
 * Register for push notifications via Capacitor.
 * Returns the device token on success.
 */
export async function registerPushNotifications(): Promise<PushRegistration> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { registered: false, error: 'Not available in this environment.' };
  }

  try {
    // Request permission from the OS
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      return {
        registered: false,
        error: 'Push notification permission not granted.',
      };
    }

    // Register with FCM/APNs
    const registerStatus: any = await PushNotifications.register();
    return { registered: true, token: registerStatus?.value?.token };
  } catch (err: any) {
    return {
      registered: false,
      error: err?.message || 'Push notification registration failed.',
    };
  }
}

/**
 * Listen for push notification events. Call this once at app init.
 * Returns an unsubscribe function.
 */
export function setupPushListeners({
  onNotificationReceived,
  onActionPerformed,
}: {
  onNotificationReceived?: (payload: any) => void;
  onActionPerformed?: (action: { actionId: string; inputValue?: string }) => void;
}): () => void {
  const removals: (() => void)[] = [];

  const removeReceived = PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      onNotificationReceived?.(notification);
    }
  );
  const removeAction = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (notification) => {
      onActionPerformed?.({
        actionId: notification.actionId,
        inputValue: notification.inputValue,
      });
    }
  );

  // Capacitor addListener returns a PluginListenerHandle (or Promise of one)
  // that has a .remove() method.
  const handle = (r: any) => {
    if (r && typeof r.remove === 'function') removals.push(() => r.remove());
    else if (r && typeof r.then === 'function') {
      r.then((h: any) => {
        if (h && typeof h.remove === 'function') removals.push(() => h.remove());
      });
    }
  };
  handle(removeReceived);
  handle(removeAction);

  return () => {
    removals.forEach((fn) => fn());
  };
}

/**
 * Deliver a local notification (useful for session reminders, daily digest, etc.)
 * without needing a remote push server.
 */
export async function scheduleLocalNotification({
  title,
  body,
  id = 1,
  scheduleAt,
}: {
  title: string;
  body: string;
  id?: number;
  scheduleAt?: Date;
}) {
  const PN = PushNotifications as any;
  if (typeof PN.scheduleLocalNotification === 'function') {
    await PN.scheduleLocalNotification({
      id,
      title,
      body,
      schedule: scheduleAt ? { at: scheduleAt } : undefined,
    });
  }
}
