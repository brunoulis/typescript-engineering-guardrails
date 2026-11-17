/** Example normalization contract: truncate explicitly, then reject zero/unsafe integers. */
export function normalizedPositiveInteger(raw: string, name: string): number {
  const parsed = raw.trim() ? Number(raw) : NaN;
  const normalized = Math.trunc(parsed);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new RangeError(`${name} must normalize to a positive safe integer`);
  }
  return normalized;
}

export interface RetentionBudget {
  rawRetentionMs: number;
  refreshLookbackMs: number;
  bucketWidthMs: number;
  schedulerDelayBudgetMs: number;
}

/** Conservative fixed-duration overlap guard; passing is not proof of production safety. */
export function assertRetentionBudget(budget: RetentionBudget): void {
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} needs a positive finite integer budget`);
  }
  const required = budget.refreshLookbackMs + budget.bucketWidthMs + budget.schedulerDelayBudgetMs;
  if (!Number.isSafeInteger(required) || budget.rawRetentionMs <= required) {
    throw new RangeError('Raw retention must exceed refresh lookback plus bucket and scheduler budgets');
  }
}

export type PolicyChangeOutcome = { status: 'applied' } | { status: 'failed'; error: unknown };

/** Call only for an already authorized change. Applied means verified desired catalog state, not active scheduling. */
export async function verifyPolicyChange(
  apply: () => Promise<void>,
  matchesDesiredCatalog: () => Promise<boolean>,
): Promise<PolicyChangeOutcome> {
  try {
    await apply();
    if (!await matchesDesiredCatalog()) throw new Error('Installed policy does not match requested state');
    return { status: 'applied' };
  } catch (error) {
    return { status: 'failed', error };
  }
}
