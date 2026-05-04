
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
};

const HMAC_SECRET = process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY ?? null;

// V16: 3 retries × exponential backoff. Tests can shrink the base delay so
// the suite doesn't burn 7s per failure case waiting for 1s/2s/4s sleeps.
// Resolved per call rather than at module load so test setup can override
// REGISTER_DEVICE_BASE_DELAY_MS without re-importing the module.
function getBaseDelayMs(): number {
  const fromEnv = process.env.REGISTER_DEVICE_BASE_DELAY_MS;
  if (!fromEnv) return 1000;
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

/**
 * V16+F6: registers the device with the push fallback service. Returns
 * `true` on success, `false` when retries are exhausted or the request
 * never went out (no push token, 4xx client error, network down). The
 * caller surfaces `false` to the user via uiStore + a settings flag so a
 * server outage during onboarding doesn't silently break server-side push.
 */
export async function registerDevice(
  input: Omit<RegisterPayload, 'expoPushToken'>,
): Promise<boolean> {
  const token = await getExpoPushToken();
  if (!token) {
    logger.warn('skip register: no push token');
    return false;
  }
  const body: RegisterPayload = { ...input, expoPushToken: token };
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const signature = signRegisterBody(raw, HMAC_SECRET);
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
          // Network / DNS / abort — retryable. Original error goes to logger
          // below via withRetry's lastError; the typed NetworkError is what
          // makes withRetry's isRetryable predicate kick in.
          logger.warn('register-device-fetch-failed', { error: String(e) });
          throw new NetworkError();
        }
        if (res.ok) return;
        if (res.status >= 500) {
          // Transient server fault — retryable.
          throw new ApiServerError(res.status, `register-device ${res.status}`);
        }
        // 4xx is a client-side bug (bad payload, missing HMAC, etc.) — retrying
        // won't help. Surface as a non-retryable error so withRetry stops.
        throw new RegisterDeviceClientError(res.status);
      },
      { retries: 3, baseDelayMs: getBaseDelayMs() },
    );
    return true;
  } catch (e) {
    logger.warn('register-device-failed-after-retries', { error: String(e) });
    return false;
  }
}

class RegisterDeviceClientError extends Error {
  constructor(public readonly status: number) {
    super(`register-device-${status}`);
    this.name = 'RegisterDeviceClientError';
  }
}

/**
 * S4: Asks the server to delete the row associated with this device's
 * push token. Used by the "Verilerimi sil" / "Delete my data" Settings flow.
 * Returns true on a 2xx, false on transport failure or non-2xx — the caller
 * still proceeds with the local wipe so the user is never trapped.
 */
export async function unregisterDevice(): Promise<boolean> {
  const token = await getExpoPushToken();
  if (!token) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/unregister-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ expoPushToken: token }),
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
