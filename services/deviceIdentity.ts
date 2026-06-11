import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { logger } from '@/utils/logger';

// Must mirror the server validator (supabase/functions/_shared/validators.ts
// DEVICE_ID_RE). deviceId is optional/best-effort (dedup only): an off-spec
// native id (some OEM/rooted ROMs) that the edge function would 400 must NOT be
// sent — that 400 maps to a permanent "incompatible" banner with no retry, which
// would silently cost the device its server push fallback. So an id outside this
// charset/length degrades to null → the client registers on the push token.
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function sanitize(id: string | null): string | null {
  return id && DEVICE_ID_RE.test(id) ? id : null;
}

/**
 * A stable per-install identifier: Android ID (per app-signing-key + user +
 * device) or iOS IDFV. Returns null when unavailable (IDFV momentarily nil, an
 * unexpected platform, an off-spec id, or a native error) — the caller then
 * falls back to the push-token-keyed registration path (no dedup, but still
 * registers).
 */
export async function getDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      return sanitize(Application.getAndroidId());
    }
    if (Platform.OS === 'ios') {
      return sanitize(await Application.getIosIdForVendorAsync());
    }
    return null;
  } catch (e) {
    logger.warn('device-id-read-failed', { error: String(e) });
    return null;
  }
}
