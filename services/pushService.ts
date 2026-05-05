import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { logger } from '@/utils/logger';

export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' }
  | { ok: false; reason: 'permission-denied' }
  | { ok: false; reason: 'fetch-failed'; error: string };

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return req.status === 'granted';
}

// Discriminated so the caller can tell a transient SDK hiccup apart from
// a permission denial — V5 already surfaces permission state through
// notificationPermissionDenied, but a fetch-failed result needs its own
// banner + retry path (issue #13).
export async function getExpoPushToken(): Promise<TokenResult> {
  if (!Device.isDevice) {
    logger.warn('push token skipped on simulator/emulator');
    return { ok: false, reason: 'simulator' };
  }
  const granted = await requestPermission();
  if (!granted) return { ok: false, reason: 'permission-denied' };
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return { ok: true, token: token.data };
  } catch (e) {
    const msg = String(e);
    logger.error('expo push token failed', { error: msg });
    return { ok: false, reason: 'fetch-failed', error: msg };
  }
}
