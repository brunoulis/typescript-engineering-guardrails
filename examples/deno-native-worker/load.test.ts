import { deepEqual, equal, ok } from "node:assert/strict";
import { type Arrival, collectLoad, percentile, summarize } from "./load.ts";

Deno.test("percentiles use actual sorted samples and preserve the input", () => {
  const samples = [100, 1, 4, 2, 3];
  equal(percentile(samples, 0.5), 3);
  equal(percentile(samples, 0.95), 100);
  equal(percentile(samples, 0.99), 100);
  equal(percentile([], 0.5), null);
  deepEqual(samples, [100, 1, 4, 2, 3]);
});

Deno.test("summary separates admission rejections and real client BUSY", () => {
  const rows: Arrival[] = [
    { scheduledMs: 0, startedMs: 2, completedMs: 10, outcome: "OK" },
    { scheduledMs: 5, startedMs: 6, completedMs: 6, outcome: "ADMISSION_BUSY" },
    { scheduledMs: 10, startedMs: 11, completedMs: 12, outcome: "BUSY" },
    { scheduledMs: 15, startedMs: 16, completedMs: 20, outcome: "TIMEOUT" },
    { scheduledMs: 20, startedMs: 21, completedMs: 30, outcome: "OK" },
  ];
  const result = summarize(rows, 100);
  equal(result.offered, 5);
  equal(result.admitted, 4);
  equal(result.successes, 2);
  equal(result.throughputPerSecond, 20);
  deepEqual(result.errors, { ADMISSION_BUSY: 1, BUSY: 1, TIMEOUT: 1 });
  equal(result.latencyMs.p50, 5);
  equal(result.latencyMs.p95, 10);
  equal(result.successLatencyMs.p50, 10);
});

Deno.test("collector retains every scheduled arrival after a synchronous stall", async () => {
  let first = true;
  const result = await collectLoad({
    arrivals: 5,
    intervalMs: 5,
    concurrency: 1,
    operation() {
      if (first) {
        first = false;
        const until = performance.now() + 40;
        while (performance.now() < until) { /* real event-loop stall */ }
      }
    },
  });
  equal(result.rows.length, 5);
  deepEqual(result.rows.map((row) => row.scheduledMs), [0, 5, 10, 15, 20]);
  equal(result.rows.filter((row) => row.outcome === "OK").length, 5);
  ok(result.rows[1]!.startedMs - result.rows[1]!.scheduledMs >= 25);
  ok(Math.max(...result.loopDelayMs) >= 25);
});

Deno.test("collector bounds asynchronous admissions and joins errors", async () => {
  const result = await collectLoad({
    arrivals: 6,
    intervalMs: 1,
    concurrency: 2,
    async operation() {
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new Error("controlled failure");
    },
  });
  equal(result.rows.length, 6);
  equal(
    result.rows.filter((row) => row.outcome === "ADMISSION_BUSY").length,
    4,
  );
  equal(result.rows.filter((row) => row.outcome === "UNEXPECTED").length, 2);
  ok(result.elapsedMs >= 50);
});

Deno.test("collector never dispatches before the programmed arrival", async () => {
  const result = await collectLoad({
    arrivals: 80,
    intervalMs: 10,
    concurrency: 1,
    operation() {},
  });
  ok(result.rows.every((row) => row.startedMs >= row.scheduledMs));
});

Deno.test("collector counts undefined rejection as failure rather than success", async () => {
  const result = await collectLoad({
    arrivals: 1,
    intervalMs: 1,
    concurrency: 1,
    operation: () => Promise.reject(undefined),
  });
  equal(result.rows[0]!.outcome, "UNEXPECTED");
});
