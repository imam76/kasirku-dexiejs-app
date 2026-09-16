export interface PosPerformanceTrace {
  checkpoint: (stage: string) => void;
  report: (outcome: string) => void;
}

// Opt in on the cashier device with localStorage['frayukti-pos-performance'] = '1'.
// Timings contain no cart, payment, or member data, and are never uploaded.
export const createPosPerformanceTrace = (): PosPerformanceTrace => {
  let enabled = false;
  try {
    enabled = typeof localStorage !== 'undefined'
      && localStorage.getItem('frayukti-pos-performance') === '1';
  } catch { /* Storage can be unavailable in restricted webviews. */ }
  if (!enabled) return { checkpoint: () => {}, report: () => {} };

  const startedAt = performance.now();
  const traceId = crypto.randomUUID();
  let previous = startedAt;
  const stages: Array<{ stage: string; durationMs: number; elapsedMs: number }> = [];
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    checkpoint(stage) {
      const now = performance.now();
      stages.push({ stage, durationMs: round(now - previous), elapsedMs: round(now - startedAt) });
      previous = now;
    },
    report(outcome) {
      console.debug('[POS performance]', {
        traceId,
        outcome,
        totalMs: round(performance.now() - startedAt),
        stages: stages.map((stage) => ({ ...stage })),
      });
    },
  };
};
