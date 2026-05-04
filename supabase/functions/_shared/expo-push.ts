// F1: pure parser/classifier for Expo /push/send responses.
// Side-effects (DB delete, log upsert) live in the Deno entry point;
// this module just decides what each ticket means.

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: string | null;
  data?: Record<string, unknown>;
};

export type ExpoTicket =
  | { status: 'ok'; id?: string }
  | {
      status: 'error';
      message?: string;
      details?: { error?: string; expoPushToken?: string };
    };

export type ExpoResponseBody = {
  data?: ExpoTicket[];
  errors?: unknown;
};

export type PushLogRow = {
  device_id: string;
  prayer_key: string;
  scheduled_for: string;
  local_date: string;
  expo_response?: ExpoTicket;
};

export type Pair = { message: ExpoMessage; log: PushLogRow };

export type BatchOutcome = {
  enrichedLogs: PushLogRow[];
  tokensToRemove: string[];
  rateLimitedTokens: string[];
};

export type BatchResponse =
  | { ok: true; body?: ExpoResponseBody }
  | { ok: false; status: number };

export function processBatchResponse(pairs: Pair[], response: BatchResponse): BatchOutcome {
  const enrichedLogs: PushLogRow[] = [];
  const removeSet = new Set<string>();
  const rateLimitSet = new Set<string>();

  if (!response.ok) {
    const ticket: ExpoTicket = {
      status: 'error',
      message: `expo-non-2xx-${response.status}`,
    };
    for (const p of pairs) {
      enrichedLogs.push({ ...p.log, expo_response: ticket });
    }
    return { enrichedLogs, tokensToRemove: [], rateLimitedTokens: [] };
  }

  const data = response.body?.data;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;
    const ticket = Array.isArray(data) ? data[i] : undefined;
    if (!ticket) {
      enrichedLogs.push({
        ...pair.log,
        expo_response: { status: 'error', message: 'missing-ticket' },
      });
      continue;
    }
    enrichedLogs.push({ ...pair.log, expo_response: ticket });
    if (ticket.status !== 'error') continue;
    const code = ticket.details?.error;
    if (code === 'DeviceNotRegistered') removeSet.add(pair.message.to);
    else if (code === 'MessageRateExceeded') rateLimitSet.add(pair.message.to);
  }

  return {
    enrichedLogs,
    tokensToRemove: Array.from(removeSet),
    rateLimitedTokens: Array.from(rateLimitSet),
  };
}
