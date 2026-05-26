// Pure parser/classifier for Expo /push/send responses. Side-effects
// (DB delete, log upsert) live in the Deno entry point; this module
// just decides what each ticket means.

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
  id?: number;
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
  | { ok: false; status: number; reason?: string };

export type ReservedLogRow = {
  id: number;
  device_id: string;
  prayer_key: string;
  local_date: string;
};

export type ReceiptTicket =
  | { status: 'ok' }
  | {
      status: 'error';
      message?: string;
      details?: { error?: string; expoPushToken?: string };
    };

export type ReceiptPair = {
  receiptId: string;
  token: string;
  logId: number;
};

export type ReceiptResponseBody = {
  data?: Record<string, ReceiptTicket>;
  errors?: unknown;
};

export type ReceiptResponse =
  | { ok: true; body?: ReceiptResponseBody }
  | { ok: false; status: number; reason?: string };

export type ReceiptOutcome = {
  receiptLogs: Array<{ logId: number; expo_response: ReceiptTicket }>;
  tokensToRemove: string[];
  rateLimitedTokens: string[];
};

function logKey(row: Pick<PushLogRow, 'device_id' | 'prayer_key' | 'local_date'>): string {
  return `${row.device_id}\u0000${row.prayer_key}\u0000${row.local_date}`;
}

export function filterPairsByReservedLogs(pairs: Pair[], reservedRows: ReservedLogRow[]): Pair[] {
  const reserved = new Map(reservedRows.map((row) => [logKey(row), row.id]));
  return pairs.flatMap((pair) => {
    const id = reserved.get(logKey(pair.log));
    return id === undefined ? [] : [{ ...pair, log: { ...pair.log, id } }];
  });
}

export function processBatchResponse(pairs: Pair[], response: BatchResponse): BatchOutcome {
  const enrichedLogs: PushLogRow[] = [];
  const removeSet = new Set<string>();
  const rateLimitSet = new Set<string>();

  if (!response.ok) {
    const ticket: ExpoTicket = {
      status: 'error',
      message: response.reason ?? `expo-non-2xx-${response.status}`,
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

export function processReceiptResponse(
  pairs: ReceiptPair[],
  response: ReceiptResponse,
): ReceiptOutcome {
  const receiptLogs: ReceiptOutcome['receiptLogs'] = [];
  const removeSet = new Set<string>();
  const rateLimitSet = new Set<string>();

  if (!response.ok) {
    const ticket: ReceiptTicket = {
      status: 'error',
      message: response.reason ?? `receipts-non-2xx-${response.status}`,
    };
    for (const pair of pairs) receiptLogs.push({ logId: pair.logId, expo_response: ticket });
    return { receiptLogs, tokensToRemove: [], rateLimitedTokens: [] };
  }

  const data = response.body?.data ?? {};
  for (const pair of pairs) {
    const ticket = data[pair.receiptId] ?? {
      status: 'error',
      message: 'missing-receipt',
    };
    receiptLogs.push({ logId: pair.logId, expo_response: ticket });
    if (ticket.status !== 'error') continue;
    const code = ticket.details?.error;
    if (code === 'DeviceNotRegistered') removeSet.add(pair.token);
    else if (code === 'MessageRateExceeded') rateLimitSet.add(pair.token);
  }

  return {
    receiptLogs,
    tokensToRemove: Array.from(removeSet),
    rateLimitedTokens: Array.from(rateLimitSet),
  };
}

// Synthetic push_log row for a per-device cron-loop failure (bad timezone,
// upstream API outage, prayer-time parse crash). Without this audit row a
// single corrupt device row would silently drop pushes forever. The
// '_system' prayer_key keeps the (device_id, prayer_key, local_date)
// dedup key from clashing with real prayer notifications.
export function buildDeviceErrorLog(
  deviceId: string,
  now: Date,
  error: unknown,
  localDate?: string,
): PushLogRow {
  return {
    device_id: deviceId,
    prayer_key: '_system',
    scheduled_for: now.toISOString(),
    local_date: localDate ?? now.toISOString().slice(0, 10),
    expo_response: { status: 'error', message: `device-loop-error: ${String(error)}` },
  };
}
