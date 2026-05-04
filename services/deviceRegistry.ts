
import { signRegisterBody } from './deviceRegistry.signing';
import { getExpoPushToken } from './pushService';
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

export async function registerDevice(input: Omit<RegisterPayload, 'expoPushToken'>): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) {
    logger.warn('skip register: no push token');
    return;
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
    const res = await fetch(`${SUPABASE_URL}/functions/v1/register-device`, {
      method: 'POST',
      headers,
      body: raw,
    });
    if (!res.ok) {
      logger.warn('register-device non-2xx', { status: res.status });
    }
  } catch (e) {
    logger.warn('register-device network failed', { error: String(e) });
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
