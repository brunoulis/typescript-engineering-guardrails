import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

/** Explicit, opt-in recipe. Invoke in a trusted project; this is not an auditor hook. */
export function typedPromiseConfig(tsconfigRootDir: string): Linter.Config[] {
  return [{
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: true, tsconfigRootDir } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/no-misused-promises': 'error' },
  }];
}
