import { analyzeInTypeScript } from "./baseline.ts";
import { analyzeTelemetry } from "./engine-client.ts";
import type { AnalysisInput, AnalysisResult } from "./types/analysis.ts";

export function makeInput(size: number): AnalysisInput {
  return {
    sessionId: `deterministic-${size}`,
    samples: Array.from(
      { length: size },
      (_, i) => ((i * 48271) % 65521 - 32760) / 1024,
    ),
    maxLag: 64,
  };
}

function assertParity(actual: AnalysisResult, expected: AnalysisResult) {
  if (
    actual.sessionId !== expected.sessionId ||
    actual.correlations.length !== expected.correlations.length ||
    actual.correlations.some((value, index) =>
      !Number.isFinite(value) ||
      Math.abs(value - expected.correlations[index]!) >
        1e-10 * Math.max(1, Math.abs(expected.correlations[index]!))
    )
  ) throw new Error("Measurement parity failed");
}

export async function verifyParity(input: AnalysisInput) {
  const expected = analyzeInTypeScript(input);
  assertParity(await analyzeTelemetry(input), expected);
  return expected;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function measurementIdentity(inputs: readonly AnalysisInput[]) {
  const binary = new URL(
    `./worker/target/release/telemetry-worker${
      Deno.build.os === "windows" ? ".exe" : ""
    }`,
    import.meta.url,
  );
  return {
    runtime: Deno.version,
    target: Deno.build.target,
    binary: binary.pathname,
    binarySha256: await sha256(await Deno.readFile(binary)),
    inputSha256: await Promise.all(
      inputs.map((input) =>
        sha256(new TextEncoder().encode(JSON.stringify(input)))
      ),
    ),
    build:
      "cargo build --release --locked --manifest-path worker/Cargo.toml --bins",
    algorithm: "ascending-lag/index uncentered autocorrelation; maxLag=64",
  };
}

// Deno 2.9.8 loads benchmark roots with import.meta.main=false. Registration
// must be unconditional; identity reporting stays lazy so load.ts imports do
// not read the binary or print benchmark metadata.
{
  const inputs = [1000, 10000, 100000].map(makeInput);
  const expected = inputs.map(analyzeInTypeScript);
  let prepared = false;
  for (const [index, input] of inputs.entries()) {
    for (const round of [0, 1]) {
      const engines = round === 0
        ? ["typescript", "ipc"]
        : ["ipc", "typescript"];
      for (const engine of engines) {
        Deno.bench({
          name: `${input.samples.length}/${round}/${engine}`,
          group: `${input.samples.length}/order-${round}`,
          baseline: engine === "typescript",
          warmup: 3,
          n: 30,
          async fn(context) {
            if (!prepared) {
              // The JSON bench reporter suppresses console output from callbacks.
              // Write the versioned identity sidecar directly, outside the timer.
              Deno.stderr.writeSync(new TextEncoder().encode(
                JSON.stringify({
                  format: "telemetry-bench-config-v1",
                  identity: await measurementIdentity(inputs),
                  warmup: 3,
                  n: 30,
                  note:
                    "Deno may calibrate beyond requested iterations; retain actual n and raw JSON with runtime version",
                  order: ["TS,IPC", "IPC,TS"],
                  boundary:
                    "whole operation; IPC includes serialization, startup, transport, validation, teardown",
                }) + "\n",
              ));
              prepared = true;
            }
            context.start();
            const result = engine === "typescript"
              ? analyzeInTypeScript(input)
              : await analyzeTelemetry(input);
            context.end();
            assertParity(result, expected[index]!);
          },
        });
      }
    }
  }
}
