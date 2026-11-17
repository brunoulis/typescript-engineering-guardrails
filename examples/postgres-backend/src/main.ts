import { z } from 'zod';
import { requiredEnvironment } from './config.js';
import { startBackend } from './server.js';

const server = await startBackend({
  databaseUrl: requiredEnvironment('BACKEND_TEST_DATABASE_URL'),
  secret: z.string().min(32).parse(requiredEnvironment('BETTER_AUTH_SECRET')),
  port: z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? '8787'),
});
console.log(`Local test backend listening at ${server.origin}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void server.close().catch(() => { console.error('Backend shutdown failed'); process.exitCode = 1; });
  });
}
