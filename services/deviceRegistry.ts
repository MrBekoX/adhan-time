import { logger } from '@/utils/logger';

import { getExpoPushToken } from './pushService';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient';

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

export async function registerDevice(input: Omit<RegisterPayload, 'expoPushToken'>): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) {
    logger.warn('skip register: no push token');
    return;
  }
  const body: RegisterPayload = { ...input, expoPushToken: token };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/register-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn('register-device non-2xx', { status: res.status });
    }
  } catch (e) {
    logger.warn('register-device network failed', { error: String(e) });
  }
}
