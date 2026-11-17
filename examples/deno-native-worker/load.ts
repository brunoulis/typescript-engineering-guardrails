export type Arrival = {
  scheduledMs: number;
  startedMs: number;
  completedMs: number;
  outcome: string;
};

import { AnalysisError, analyzeTelemetry } from "./engine-client.ts";
import { analyzeInTypeScript } from "./baseline.ts";

export function percentile(
  samples: readonly number[],
  p: number,
): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

function distribution(samples: readonly number[]) {
  return {
    count: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: samples.length ? Math.max(...samples) : null,
  };
}

export function summarize(rows: readonly Arrival[], elapsedMs: number) {
  const successes = rows.filter((row) => row.outcome === "OK");
  const errors: Record<string, number> = {};
  for (const row of rows) {
    if (row.outcome !== "OK") {
      errors[row.outcome] = (errors[row.outcome] ?? 0) + 1;
    }
  }
  const latency = (row: Arrival) => row.completedMs - row.scheduledMs;
  return {
    offered: rows.length,
    admitted: rows.length - (errors.ADMISSION_BUSY ?? 0),
    successes: successes.length,
    errors,
    throughputPerSecond: successes.length / (elapsedMs / 1000),
    latencyMs: distribution(rows.map(latency)),
    successLatencyMs: distribution(successes.map(latency)),
    schedulingDelayMs: distribution(
      rows.map((row) => row.startedMs - row.scheduledMs),
    ),
  };
}

export async function collectLoad(options: {
  arrivals: number;
  intervalMs: number;
  concurrency: 1 | 2;
  operation: () => void | Promise<void>;
}): Promise<{ rows: Arrival[]; elapsedMs: number; loopDelayMs: number[] }> {
  const origin = performance.now();
  const rows: Arrival[] = [];
  const pending = new Set<Promise<void>>();
  const loopDelayMs: number[] = [];
  let inFlight = 0;
  let nextTick = options.intervalMs;
  // Record every overdue timer opportunity, including stalls during sync TS work.
  const sampleLoop = () => {
    const now = performance.now() - origin;
    while (nextTick <= now) {
      loopDelayMs.push(now - nextTick);
      nextTick += options.intervalMs;
    }
  };
  const heartbeat = setInterval(sampleLoop, options.intervalMs);
  try {
    for (let index = 0; index < options.arrivals; index++) {
      const scheduledMs = index * options.intervalMs;
      let wait = scheduledMs - (performance.now() - origin);
      while (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        wait = scheduledMs - (performance.now() - origin);
      }
      const row: Arrival = {
        scheduledMs,
        startedMs: performance.now() - origin,
        completedMs: 0,
        outcome: "OK",
      };
      rows.push(row);
      if (inFlight === options.concurrency) {
        row.outcome = "ADMISSION_BUSY";
        row.completedMs = performance.now() - origin;
        continue;
      }
      inFlight++;
      const finish = (failed = false, error?: unknown) => {
        if (failed) {
          row.outcome = error instanceof AnalysisError
            ? error.code
            : "UNEXPECTED";
        }
        row.completedMs = performance.now() - origin;
        inFlight--;
      };
      try {
        const result = options.operation();
        if (result === undefined) finish();
        else {
          const joined = result.then(
            () => finish(),
            (error) => finish(true, error),
          );
          pending.add(joined);
          void joined.then(() => pending.delete(joined));
        }
      } catch (error) {
        finish(true, error);
      }
    }
    await Promise.all(pending);
    sampleLoop();
    return {
      rows,
      loopDelayMs,
      elapsedMs: Math.max(
        performance.now() - origin,
        options.arrivals * options.intervalMs,
      ),
    };
  } finally {
    clearInterval(heartbeat);
  }
}

if (import.meta.main) {
  const { makeInput, verifyParity, measurementIdentity } = await import(
    "./benchmark.ts"
  );
  const input = makeInput(100000);
  await verifyParity(input);
  const config = { arrivals: 120, intervalMs: 10 };
  console.log(JSON.stringify({
    format: "telemetry-load-v1",
    identity: await measurementIdentity([input]),
    config,
    totalCpu: "UNMEASURED",
    totalRam: "UNMEASURED",
    tsWorkerAlternative: "UNVERIFIED",
  }));
  for (const concurrency of [1, 2] as const) {
    // Alternate order across the two independent capacity configurations.
    const engines = concurrency === 1
      ? ["typescript", "ipc"]
      : ["ipc", "typescript"];
    for (const engine of engines) {
      const result = await collectLoad({
        ...config,
        concurrency,
        operation: engine === "typescript"
          ? () => {
            analyzeInTypeScript(input);
          }
          : async () => {
            await analyzeTelemetry(input);
          },
      });
      console.log(JSON.stringify({
        engine,
        concurrency,
        summary: summarize(result.rows, result.elapsedMs),
        eventLoopDelayMs: distribution(result.loopDelayMs),
        ...result,
      }));
    }
  }
}
