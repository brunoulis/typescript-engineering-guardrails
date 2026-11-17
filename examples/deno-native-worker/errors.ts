import type { AnalysisErrorCode } from "./types/analysis.ts";

const messages: Record<AnalysisErrorCode, string> = {
  INVALID_INPUT: "Invalid analysis input or options.",
  ABORTED: "Analysis was aborted.",
  TIMEOUT: "Analysis exceeded its time budget.",
  BUSY: "Analysis capacity is occupied.",
  UNAVAILABLE: "Native analysis worker is unavailable.",
  PROTOCOL: "Native analysis response violated the protocol.",
  NATIVE_FAILURE: "Native analysis worker failed.",
};

export class AnalysisError extends Error {
  constructor(readonly code: AnalysisErrorCode) {
    super(messages[code]);
    this.name = "AnalysisError";
  }
}
