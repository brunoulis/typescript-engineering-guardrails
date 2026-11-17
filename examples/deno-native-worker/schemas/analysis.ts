import type { AnalysisInput, AnalysisResult } from "../types/analysis.ts";
import { AnalysisError } from "../errors.ts";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_LAG,
  MAX_SAMPLE_MAGNITUDE,
  MAX_SAMPLES,
  MAX_SESSION_LENGTH,
  MAX_TIMEOUT_MS,
  MIN_SAMPLES,
} from "../constants/limits.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateInput(value: unknown): asserts value is AnalysisInput {
  if (
    !record(value) ||
    Object.keys(value).some((key) =>
      !["sessionId", "samples", "maxLag"].includes(key)
    ) ||
    typeof value.sessionId !== "string" || value.sessionId.length === 0 ||
    !value.sessionId.isWellFormed() ||
    value.sessionId.length > MAX_SESSION_LENGTH ||
    !Array.isArray(value.samples) || value.samples.length < MIN_SAMPLES ||
    value.samples.length > MAX_SAMPLES ||
    typeof value.maxLag !== "number" || !Number.isInteger(value.maxLag) ||
    value.maxLag < 1 ||
    value.maxLag > Math.min(MAX_LAG, value.samples.length - 1)
  ) {
    throw new AnalysisError("INVALID_INPUT");
  }
  for (const sample of value.samples) {
    if (
      typeof sample !== "number" || !Number.isFinite(sample) ||
      Math.abs(sample) > MAX_SAMPLE_MAGNITUDE
    ) {
      throw new AnalysisError("INVALID_INPUT");
    }
  }
}

export function validateOptions(value: unknown): number {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !["signal", "timeoutMs"].includes(key)) ||
    (value.signal !== undefined && !(value.signal instanceof AbortSignal))
  ) {
    throw new AnalysisError("INVALID_INPUT");
  }
  const timeout = value.timeoutMs === undefined
    ? DEFAULT_TIMEOUT_MS
    : value.timeoutMs;
  if (
    typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1 ||
    timeout > MAX_TIMEOUT_MS
  ) {
    throw new AnalysisError("INVALID_INPUT");
  }
  return timeout;
}

export function parseResponse(
  bytes: Uint8Array,
  input: AnalysisInput,
): AnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AnalysisError("PROTOCOL");
  }
  if (!record(value) || value.version !== 1) {
    throw new AnalysisError("PROTOCOL");
  }
  if (
    Object.keys(value).length === 2 &&
    (value.error === "INVALID_INPUT" || value.error === "PROTOCOL")
  ) {
    throw new AnalysisError(value.error);
  }
  const result = value.result;
  if (
    Object.keys(value).length !== 2 || !record(result) ||
    Object.keys(result).length !== 2 ||
    result.sessionId !== input.sessionId ||
    !Array.isArray(result.correlations) ||
    result.correlations.length !== input.maxLag
  ) {
    throw new AnalysisError("PROTOCOL");
  }
  const correlations: number[] = [];
  for (const correlation of result.correlations) {
    if (
      typeof correlation !== "number" || !Number.isFinite(correlation) ||
      Math.abs(correlation) > MAX_SAMPLE_MAGNITUDE ** 2
    ) {
      throw new AnalysisError("PROTOCOL");
    }
    correlations.push(correlation);
  }
  return { sessionId: input.sessionId, correlations };
}
