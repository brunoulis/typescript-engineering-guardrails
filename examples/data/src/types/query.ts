export type Query = (text: string, parameters?: readonly (string | number | boolean | null)[]) => Promise<Record<string, unknown>[]>;
