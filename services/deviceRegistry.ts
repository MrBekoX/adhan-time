import { Platform } from 'react-native';

import { isBatteryExempt } from './batteryOptimization';
import { getDeviceId } from './deviceIdentity';
import { signRegisterBody } from './deviceRegistry.signing';
import { ApiServerError, NetworkError } from './errors';
import { getExpoPushToken } from './pushService';
import { withRetry } from './retry';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient';

import { logger } from '@/utils/logger';

type RegisterPayload = {
  expoPushToken: string;
  districtId: string;
  districtName: string;
  countryName: string;
  timezone: string;
  locale: string;
  sound: string;
  enabledPrayers: string[];
  reminderMinutes: number;
  deviceId?: string;
  platform?: 'android' | 'ios';
  batteryExempt?: boolean;
};

function getHmacSecret(): string | null {
  const raw = process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY;
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}

// Resolved per call rather than at module load so tests can override
// REGISTER_DEVICE_BASE_DELAY_MS to skip the 1s/2s/4s exponential sleeps
// without re-importing this module.
function getBaseDelayMs(): number {
  const fromEnv = process.env.REGISTER_DEVICE_BASE_DELAY_MS;
  if (!fromEnv) return 1000;
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

class RegisterDeviceClientError extends Error {
  constructor(public readonly status: number) {
    super(`register-device-${status}`);
    this.name = 'RegisterDeviceClientError';
  }
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'no-token' }
  | { ok: false; reason: 'token-fetch-failed' }
  | { ok: false; reason: 'transient' }
  | { ok: false; reason: 'registration-disabled'; code: 'missing-client-hmac' }
  | { ok: false; reason: 'incompatible'; status: number };

// Branches the caller relies on:
//   - 'incompatible' is a 4xx — retry won't help, banner copy points the
//     user at an app update; pending flag must NOT be set.
//   - 'token-fetch-failed' looks transient like 5xx but originates on the
//     push side, so the banner copy points at "check connection" instead.
//   - 'no-token' covers both simulator and permission-denied; the latter
//     is already surfaced through notificationPermissionDenied elsewhere.
export async function registerDeviceDetailed(
  input: Omit<RegisterPayload, 'expoPushToken'>,
): Promise<RegisterResult> {
  const hmacSecret = getHmacSecret();
  if (!hmacSecret) {
    logger.warn('register-device-disabled', { reason: 'missing-client-hmac' });
    return { ok: false, reason: 'registration-disabled', code: 'missing-client-hmac' };
  }

  const tokenResult = await getExpoPushToken();
  if (!tokenResult.ok) {
    if (tokenResult.reason === 'fetch-failed') {
      logger.warn('skip register: token fetch failed', { error: tokenResult.error });
      return { ok: false, reason: 'token-fetch-failed' };
    }
    logger.warn('skip register: no push token', { reason: tokenResult.reason });
    return { ok: false, reason: 'no-token' };
  }
  const token = tokenResult.token;
  // Device signals are best-effort: gather them here so callers (onboarding,
  // lifecycle) stay unaware. Failures degrade gracefully (see deviceIdentity /
  // batteryOptimization) — platform is always sent; deviceId/batteryExempt are
  // omitted when unavailable so the server applies safe defaults.
  const deviceId = await getDeviceId();
  const batteryExempt = await isBatteryExempt();
  const body: RegisterPayload = {
    ...input,
    expoPushToken: token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    ...(deviceId ? { deviceId } : {}),
    ...(batteryExempt !== undefined ? { batteryExempt } : {}),
  };
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const signature = signRegisterBody(raw, hmacSecret);
  if (signature) headers['x-body-signature'] = signature;

  try {
    await withRetry(
      async () => {
        let res: Response;
        try {
          res = await fetch(`${SUPABASE_URL}/functions/v1/register-device`, {
            method: 'POST',
            headers,
            body: raw,
          });
        } catch (e) {
          logger.warn('register-device-fetch-failed', { error: String(e) });
          throw new NetworkError();
        }
        if (res.ok) return;
        if (res.status >= 500) {
          throw new ApiServerError(res.status, `register-device ${res.status}`);
        }
        throw new RegisterDeviceClientError(res.status);
      },
      { retries: 3, baseDelayMs: getBaseDelayMs() },
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof RegisterDeviceClientError) {
      // Auth/config 4xx responses are actionable, but in Expo dev they
      // should not surface as red runtime errors with a stack trace.
      logger.warn('register-device-incompatible', {
        status: e.status,
        name: e.name,
      });
      return { ok: false, reason: 'incompatible', status: e.status };
    }
    logger.warn('register-device-failed-after-retries', { error: String(e) });
    return { ok: false, reason: 'transient' };
  }
}

export async function registerDevice(
  input: Omit<RegisterPayload, 'expoPushToken'>,
): Promise<boolean> {
  return (await registerDeviceDetailed(input)).ok;
}

// Returns false (not throws) on transport failure or non-2xx — the caller
// still proceeds with the local wipe so a server outage can't trap the
// user inside their own data.
export async function unregisterDevice(): Promise<boolean> {
  const tokenResult = await getExpoPushToken();
  if (!tokenResult.ok) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/unregister-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ expoPushToken: tokenResult.token }),
    });
    if (!res.ok) {
      logger.warn('unregister-device non-2xx', { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    logger.warn('unregister-device network failed', { error: String(e) });
    return false;
  }
}
