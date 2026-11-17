import type {
  AnalysisInput,
  AnalysisOptions,
  AnalysisResult,
} from "./types/analysis.ts";
import {
  parseResponse,
  validateInput,
  validateOptions,
} from "./schemas/analysis.ts";
import { runWorker } from "./worker-process.ts";
export { AnalysisError } from "./errors.ts";
export type {
  AnalysisInput,
  AnalysisOptions,
  AnalysisResult,
} from "./types/analysis.ts";

const executable = new URL(
  `./worker/target/release/telemetry-worker${
    Deno.build.os === "windows" ? ".exe" : ""
  }`,
  import.meta.url,
);

export async function analyzeTelemetry(
  input: AnalysisInput,
  options: AnalysisOptions = {},
): Promise<AnalysisResult> {
  validateInput(input);
  validateOptions(options);
  const requestInput = {
    sessionId: input.sessionId,
    samples: input.samples,
    maxLag: input.maxLag,
  };
  const request = new TextEncoder().encode(
    JSON.stringify({ version: 1, input: requestInput }),
  );
  const response = await runWorker(executable, request, options);
  return parseResponse(response, requestInput);
}
