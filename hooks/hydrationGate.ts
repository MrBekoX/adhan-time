export type HydrationGateInput = {
  flags: boolean[];
  elapsedMs: number;
  timeoutMs: number;
};

export type HydrationGateResult = {
  ready: boolean;
  timedOut: boolean;
};

export function evaluateHydrationGate(input: HydrationGateInput): HydrationGateResult {
  const allHydrated = input.flags.every(Boolean);
  if (allHydrated) return { ready: true, timedOut: false };
  if (input.elapsedMs >= input.timeoutMs) return { ready: true, timedOut: true };
  return { ready: false, timedOut: false };
}

export function forceHydrationFlags(setters: ((hydrated: boolean) => void)[]): void {
  for (const setHydrated of setters) {
    setHydrated(true);
  }
}
