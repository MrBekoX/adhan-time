// Shared-secret check for the pg_cron → push-prayer call. Fails closed:
// if deployed without the env var every request is rejected, preventing a
// silent re-open of the public POST endpoint when the operator forgets
// to set the secret after a redeploy.

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
