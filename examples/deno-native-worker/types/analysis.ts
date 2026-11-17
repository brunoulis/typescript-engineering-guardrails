export type AnalysisInput = {
  sessionId: string;
  samples: readonly number[];
  maxLag: number;
};

export type AnalysisResult = {
  sessionId: string;
  correlations: readonly number[];
};

export type AnalysisOptions = { signal?: AbortSignal; timeoutMs?: number };

export type AnalysisErrorCode =
  | "INVALID_INPUT"
  | "ABORTED"
  | "TIMEOUT"
  | "BUSY"
  | "UNAVAILABLE"
  | "PROTOCOL"
  | "NATIVE_FAILURE";
