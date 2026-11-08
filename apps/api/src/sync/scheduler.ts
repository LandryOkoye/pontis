// Runs a job now and then every `intervalMs`, never overlapping itself. A failed run is reported
// and the next tick tries again: the chain is the authority, so a missed sync only delays freshness.

export interface Scheduler {
  /** Resolves after any in-flight run finishes; no further runs start. */
  stop(): Promise<void>;
}

export function startScheduler(options: {
  run: () => Promise<unknown>;
  intervalMs: number;
  onError: (error: unknown) => void;
}): Scheduler {
  let running: Promise<void> | undefined;
  let stopped = false;

  const tick = () => {
    if (stopped || running) return;
    running = options
      .run()
      .then(
        () => undefined,
        (error: unknown) => options.onError(error),
      )
      .finally(() => {
        running = undefined;
      });
  };

  tick();
  const timer = setInterval(tick, options.intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
