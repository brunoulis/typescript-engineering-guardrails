import { runtimeContracts } from './runtime-suite.ts';
await runtimeContracts();
if (process.versions['bun']) {
  const {bunHttpContracts}=await import('./runtime-bun.ts');
  await bunHttpContracts();
}
