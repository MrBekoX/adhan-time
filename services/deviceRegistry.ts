
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
