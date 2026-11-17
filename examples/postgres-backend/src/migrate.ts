import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { assertLocalTestDatabase, requiredEnvironment } from './config.js';

export async function migrateDatabase(url: string): Promise<void> {
  assertLocalTestDatabase(url);
  const client = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const source = await readFile(new URL('../../migrations/001_init.sql', import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(794417261)`;
      await tx`CREATE TABLE IF NOT EXISTS backend_migration (id text PRIMARY KEY, checksum text NOT NULL)`;
      const previous = await tx`SELECT checksum FROM backend_migration WHERE id = '001_init'`;
      if (previous.length) {
        if (previous[0]?.checksum !== checksum) throw new Error('Applied migration checksum mismatch');
        return;
      }
      // Only this checked-in migration is executable; no target-controlled config or arbitrary path.
      await tx.unsafe(source);
      await tx`INSERT INTO backend_migration(id, checksum) VALUES ('001_init', ${checksum})`;
    });
  } finally { await client.end({ timeout: 5 }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrateDatabase(requiredEnvironment('BACKEND_MIGRATION_DATABASE_URL'));
}
