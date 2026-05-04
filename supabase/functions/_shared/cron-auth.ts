// S2: shared-secret check for the pg_cron → push-prayer call.
// Fails closed: if the function was deployed without the env var, every
// request is rejected. That is preferable to silently re-enabling the open
// endpoint while the operator forgets to set the secret.

const HEADER = 'x-cron-secret';

export function verifyCronSecret(req: Request, configured: string | null | undefined): boolean {
  if (!configured) return false;
  const provided = req.headers.get(HEADER);
  if (!provided) return false;
  if (provided.length !== configured.length) return false;
  // Constant-time compare so a leaked timing side-channel can't probe the secret.
  let mismatch = 0;
  for (let i = 0; i < configured.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ configured.charCodeAt(i);
  }
  return mismatch === 0;
}
