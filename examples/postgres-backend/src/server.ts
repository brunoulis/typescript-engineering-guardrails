import { once } from 'node:events';
import { createAdaptorServer } from '@hono/node-server';
import { createBackend } from './app.js';
import { assertLocalTestDatabase } from './config.js';

export async function startBackend(options: { databaseUrl: string; secret: string; port?: number }) {
  assertLocalTestDatabase(options.databaseUrl);
  let handler: (request: Request) => Response | Promise<Response> = () => new Response('starting', { status: 503 });
  const server = createAdaptorServer({ fetch: (request) => handler(request), hostname: '127.0.0.1' });
  server.listen(options.port ?? 0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  const origin = `http://127.0.0.1:${address.port}`;
  let backend: ReturnType<typeof createBackend>;
  try { backend = createBackend({ databaseUrl: options.databaseUrl, secret: options.secret, origin }); }
  catch (error) { server.close(); throw error; }
  handler = (request) => backend.app.fetch(request);
  let closing: Promise<void> | undefined;
  return { ...backend, httpServer: server, origin, close: () => {
    closing ??= (async () => {
      const timer = setTimeout(() => { if ('closeAllConnections' in server) server.closeAllConnections(); }, 5_000);
      timer.unref();
      try {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } finally { clearTimeout(timer); await backend.close(); }
    })();
    return closing;
  } };
}

