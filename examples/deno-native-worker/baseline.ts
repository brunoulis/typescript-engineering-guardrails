import type { AnalysisInput, AnalysisResult } from "./types/analysis.ts";
import { validateInput } from "./schemas/analysis.ts";

export function analyzeInTypeScript(input: AnalysisInput): AnalysisResult {
  validateInput(input);
  const correlations: number[] = [];
  for (let lag = 1; lag <= input.maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < input.samples.length - lag; i++) {
      sum += input.samples[i]! * input.samples[i + lag]!;
    }
    correlations.push(sum / (input.samples.length - lag));
  }
  return { sessionId: input.sessionId, correlations };
}
