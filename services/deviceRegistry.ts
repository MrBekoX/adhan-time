
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

class RegisterDeviceClientError extends Error {
  constructor(public readonly status: number) {
    super(`register-device-${status}`);
    this.name = 'RegisterDeviceClientError';
  }
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'no-token' }
  | { ok: false; reason: 'transient' }
  | { ok: false; reason: 'incompatible'; status: number };

// V16+F6: registers the device with the push fallback service. Returns a
// discriminated union so callers can branch on the failure mode:
//   - 'transient' (5xx, network, retries exhausted) → set pending flag,
//     surface the generic banner with retry; AppState 'active' will retry.
//   - 'incompatible' (4xx — bad payload, signing-key rotation, schema drift)
//     → retry won't help. Surface a distinct banner ("Update the app"),
//     don't queue a pending retry. The 'status' carries the HTTP code so
//     bug reports can distinguish 400/401/403/422.
//   - 'no-token' → device never asked for push; nothing to do.
export async function registerDevice(
  input: Omit<RegisterPayload, 'expoPushToken'>,
): Promise<RegisterResult> {
  const token = await getExpoPushToken();
  if (!token) {
    logger.warn('skip register: no push token');
    return { ok: false, reason: 'no-token' };
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
      // logger.error so a build-vs-server schema drift shows up in admin
      // dashboards as an actionable signal, not a routine warning.
      logger.error('register-device-incompatible', {
        status: e.status,
        name: e.name,
      });
      return { ok: false, reason: 'incompatible', status: e.status };
    }
    logger.warn('register-device-failed-after-retries', { error: String(e) });
    return { ok: false, reason: 'transient' };
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
