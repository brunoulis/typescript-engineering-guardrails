import { analyzeInTypeScript } from "./baseline.ts";
import { analyzeTelemetry } from "./engine-client.ts";
import type { AnalysisInput } from "./types/analysis.ts";
import { deepStrictEqual, rejects, throws } from "node:assert/strict";
import { fileURLToPath } from "node:url";

const golden: AnalysisInput = {
  sessionId: "golden",
  samples: [1, 2, 3],
  maxLag: 2,
};

Deno.test("request identity is captured before caller changes the input object", async () => {
  const input = { sessionId: "snapshot", samples: [1, 2, 3], maxLag: 2 };
  const result = analyzeTelemetry(input);
  input.sessionId = "changed";
  input.maxLag = 1;
  deepStrictEqual(await result, {
    sessionId: "snapshot",
    correlations: [4, 3],
  });
});

Deno.test("golden uncentered correlations and immutable caller input", async () => {
  const input = Object.freeze({ ...golden, samples: Object.freeze([1, 2, 3]) });
  const expected = { sessionId: "golden", correlations: [4, 3] };
  deepStrictEqual(analyzeInTypeScript(input), expected);
  deepStrictEqual(await analyzeTelemetry(input), expected);
});

Deno.test("baseline and release worker reject invalid domain inputs", async () => {
  for (
    const input of [
      { ...golden, sessionId: "" },
      { ...golden, sessionId: "a".repeat(129) },
      { ...golden, sessionId: "😀".repeat(65) },
      { ...golden, samples: [1] },
      { ...golden, samples: Array(100001).fill(0) },
      { ...golden, samples: [NaN, 1] },
      { ...golden, samples: [Infinity, 1] },
      { ...golden, samples: [1000001, 1] },
      { ...golden, maxLag: 0 },
      { ...golden, maxLag: 1.5 },
      { ...golden, maxLag: 3 },
      null,
    ]
  ) {
    // Deliberate runtime boundary probe: TypeScript callers can receive untrusted data.
    const unchecked = input as AnalysisInput;
    throws(() => analyzeInTypeScript(unchecked), { code: "INVALID_INPUT" });
    await rejects(analyzeTelemetry(unchecked), { code: "INVALID_INPUT" });
  }
});

for (const [name, unit] of [["high", 0xd800], ["low", 0xdc00]] as const) {
  const input = { ...golden, sessionId: String.fromCharCode(unit) };
  Deno.test(`baseline rejects isolated ${name} surrogate as INVALID_INPUT`, () => {
    throws(() => analyzeInTypeScript(input), { code: "INVALID_INPUT" });
  });
  Deno.test(`native client rejects isolated ${name} surrogate as INVALID_INPUT`, async () => {
    await rejects(analyzeTelemetry(input), { code: "INVALID_INPUT" });
  });
}

Deno.test("deterministic parity covers signs, zeros, rounding, and input limits", async () => {
  const fixtures: AnalysisInput[] = [
    { sessionId: "min", samples: [0, 0], maxLag: 1 },
    { sessionId: "signs", samples: [-2, 0, 2, -4], maxLag: 3 },
    {
      sessionId: "valid-é-\ud800\udc00-\udbff\udfff",
      samples: [1, 2, 3],
      maxLag: 2,
    },
    { sessionId: "😀".repeat(64), samples: [1e6, -1e6], maxLag: 1 },
    {
      sessionId: "large",
      samples: Array.from(
        { length: 100000 },
        (_, i) => ((i * 7919) % 20001 - 10000) / 13,
      ),
      maxLag: 64,
    },
  ];
  for (const input of fixtures) {
    const expected = analyzeInTypeScript(input);
    const actual = await analyzeTelemetry(input);
    deepStrictEqual(actual.sessionId, expected.sessionId);
    deepStrictEqual(actual.correlations.length, input.maxLag);
    for (let i = 0; i < input.maxLag; i++) {
      const left = actual.correlations[i]!;
      const right = expected.correlations[i]!;
      if (Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))) {
        throw new Error(`parity differs at lag ${i + 1}: ${left} vs ${right}`);
      }
    }
  }
});

Deno.test("public options validate timeout and preserve pre-abort", async () => {
  await rejects(analyzeTelemetry(golden, { timeoutMs: 0 }), {
    code: "INVALID_INPUT",
  });
  await rejects(analyzeTelemetry(golden, { timeoutMs: Infinity }), {
    code: "INVALID_INPUT",
  });
  await rejects(analyzeTelemetry(golden, { timeoutMs: 2 ** 31 }), {
    code: "INVALID_INPUT",
  });
  await rejects(
    analyzeTelemetry(
      golden,
      { timeoutMs: null } as unknown as { timeoutMs: number },
    ),
    { code: "INVALID_INPUT" },
  );
  await rejects(analyzeTelemetry(golden, { signal: AbortSignal.abort() }), {
    code: "ABORTED",
  });
});

Deno.test({
  name: "public operation fails safely when allow-run is denied",
  permissions: { run: false },
  fn: async () => {
    await rejects(analyzeTelemetry(golden), { code: "UNAVAILABLE" });
  },
});

Deno.test({
  name: "public operation fails safely when only fixture is allowlisted",
  permissions: {
    run: [
      fileURLToPath(
        new URL(
          `./worker/target/release/fault_fixture${
            Deno.build.os === "windows" ? ".exe" : ""
          }`,
          import.meta.url,
        ),
      ),
    ],
  },
  fn: async () => {
    await rejects(analyzeTelemetry(golden), { code: "UNAVAILABLE" });
  },
});
