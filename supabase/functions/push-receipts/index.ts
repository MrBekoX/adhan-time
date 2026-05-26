import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifyCronSecret } from '../_shared/cron-auth.ts';
import {
  processReceiptResponse,
  type ReceiptPair,
  type ReceiptResponseBody,
} from '../_shared/expo-push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? null;
const RECEIPT_LOOKBACK_HOURS = 24;
const RECEIPT_COOLDOWN_MS = 5 * 60_000;

type PushLogWithDevice = {
  id: number | string;
  expo_response?: { status?: string; id?: string } | null;
  devices?: { expo_push_token?: string | null } | { expo_push_token?: string | null }[] | null;
};

Deno.serve(async (req: Request) => {
  if (!verifyCronSecret(req, CRON_SECRET)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  try {
    const cutoff = new Date(Date.now() - RECEIPT_LOOKBACK_HOURS * 60 * 60_000).toISOString();
    const { data: rows, error } = await supabase
      .from('push_log')
      .select('id,expo_response,devices(expo_push_token)')
      .gte('sent_at', cutoff)
      .order('sent_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const receiptPairs = ((rows ?? []) as PushLogWithDevice[]).flatMap((row): ReceiptPair[] => {
      const receiptId = row.expo_response?.id;
      const token = deviceToken(row.devices);
      const logId = Number(row.id);
      if (!receiptId || !token || !Number.isFinite(logId)) return [];
      return [{ receiptId, token, logId }];
    });

    if (receiptPairs.length === 0) {
      return jsonResponse({ checked: 0, updated: 0, removed: 0, rateLimited: 0 });
    }

    const tokensToRemove = new Set<string>();
    const rateLimitedTokens = new Set<string>();
    let updated = 0;

    for (const chunkPairs of chunk(receiptPairs, 300)) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;

      let response;
      try {
        response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ids: chunkPairs.map((p) => p.receiptId) }),
        });
      } catch (e) {
        console.error('expo-receipts transport failed', e);
        const outcome = processReceiptResponse(chunkPairs, {
          ok: false,
          status: 0,
          reason: 'transport-failed',
        });
        updated += await persistReceiptOutcome(outcome.receiptLogs);
        continue;
      }

      let body: ReceiptResponseBody | undefined;
      let bodyParseFailed = false;
      try {
        body = response.ok ? ((await response.json()) as ReceiptResponseBody) : undefined;
      } catch (e) {
        console.error('expo-receipts body parse failed', e);
        bodyParseFailed = true;
      }

      const outcome = processReceiptResponse(
        chunkPairs,
        response.ok && !bodyParseFailed
          ? { ok: true, body }
          : {
              ok: false,
              status: response.status,
              reason: bodyParseFailed ? 'receipt-body-parse-failed' : undefined,
            },
      );

      updated += await persistReceiptOutcome(outcome.receiptLogs);
      for (const token of outcome.tokensToRemove) tokensToRemove.add(token);
      for (const token of outcome.rateLimitedTokens) rateLimitedTokens.add(token);
    }

    if (tokensToRemove.size > 0) {
      const { error: deleteError } = await supabase
        .from('devices')
        .delete()
        .in('expo_push_token', Array.from(tokensToRemove));
      if (deleteError) throw deleteError;
    }

    if (rateLimitedTokens.size > 0) {
      const cooldownUntil = new Date(Date.now() + RECEIPT_COOLDOWN_MS).toISOString();
      const { error: cooldownError } = await supabase
        .from('devices')
        .update({ rate_limited_until: cooldownUntil })
        .in('expo_push_token', Array.from(rateLimitedTokens));
      if (cooldownError) throw cooldownError;
    }

    return jsonResponse({
      checked: receiptPairs.length,
      updated,
      removed: tokensToRemove.size,
      rateLimited: rateLimitedTokens.size,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

async function persistReceiptOutcome(
  receiptLogs: Array<{ logId: number; expo_response: unknown }>,
): Promise<number> {
  let updated = 0;
  for (const log of receiptLogs) {
    const { error } = await supabase
      .from('push_log')
      .update({ expo_response: log.expo_response })
      .eq('id', log.logId);
    if (error) throw error;
    updated++;
  }
  return updated;
}

function deviceToken(
  device: PushLogWithDevice['devices'],
): string | null {
  if (!device) return null;
  if (Array.isArray(device)) return device[0]?.expo_push_token ?? null;
  return device.expo_push_token ?? null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
