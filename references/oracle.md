# Oracle profile

Load when `oracledb` is a dependency (manifest, `deno.json` imports or imports in source). Combine with [PostgreSQL](postgresql.md) only when both databases are really used, and with [Deno](runtime-deno.md) when the runtime is Deno. Never run anything against a production database to inspect this profile; the auditor and `doctor` never connect.

## Driver mode and client

The driver runs in thin mode by default; thick mode needs Oracle Client libraries and an explicit `initOracleClient` call (or a project setting that makes it). Establish which mode the project really uses before judging environment problems. The minimum client version is a property of the resolved driver version (R0a): read the installation documentation of the exact version in the lockfile. A reference run with `oracledb` 7.0.1 rejected a 12.2 client with `DPI-1050` and asked for 19.1 or higher, so `doctor` defaults to 19.1 and accepts `--min-client`.

```sh
node scripts/ts-rails-audit.cjs doctor oracle --root TARGET [--client-dir DIR] [--min-client 19.1]
```

It reads file names, directory names and source text only: the client library found through `--client-dir`, `ORACLE_CLIENT_LIB_DIR`, `PATH`, `LD_LIBRARY_PATH` or `DYLD_LIBRARY_PATH`; its version from the library suffix, an `instantclient_X_Y` directory or an Oracle home path (otherwise `VERSION_UNKNOWN`); the driver mode from `initOracleClient`/`thin = false` evidence; and native client libraries inside the project tree that belong to another platform. It loads no library and opens no connection, so credentials, network reachability, privileges and the real loaded version are not checked. Exit 0 OK or not required, 1 usage error or unknown version, 2 missing or too old.

Deno: loading the thick binary needs `--allow-ffi`; `NJS-045` can mean the permission or the client is missing, so read the whole message. Client libraries are platform specific; a `.so` file in a Windows checkout is meant for a container or Lambda image, not for that machine.

## SQL

Pass values as bind variables (`:name`, `:1`). Bind variables cannot parameterize identifiers or clauses (`ORDER BY`, table or column names): use a fixed allowlist of complete fragments, never request text. Numbered placeholders built as `` :${n} `` are safe because the substitution is only a position.

The auditor reports local evidence only, on `execute`, `executeMany`, `query` and `queryStream` calls whose static text looks like a statement:

- `SQL_STRING_INTERPOLATION`: a substitution or concatenated operand that is not a constant of the same file.
- `SQL_DYNAMIC_IDENTIFIER`: the same where an identifier or clause belongs (after `ORDER BY`, `GROUP BY`, `FROM`, `JOIN`, `INTO`, `UPDATE`, `TABLE`).

Constants are cleared through `const` bindings in the file; parameters, imports, calls and shadowed names are leads. A lead is cleared by reading every caller: a helper that only receives string literals is safe, one that forwards request data is not. Neither rule follows imports, wrappers or data flow, and neither proves injection.

## Connections, cursors and transactions

Review that every acquired connection is released and every cursor closed in `finally`, and that a failing close does not skip the remaining ones. A pool has one owner, warm-up and shutdown policy, and timeouts for connect and calls. Check `autoCommit` where a helper sets it (the driver default is not to commit; verify for the resolved version), that a failed rollback is reported as an unknown outcome and not as a rollback, and that row locks are taken inside the transaction that uses them.

## Tests

Prefer doubles for unit tests and a disposable database for integration tests. A test that imports a module reaching the driver does not necessarily need the native client: in the reference run ten test files reached `oracledb` through static imports, and only the file whose code initialised thick mode failed without a client. Decide by running the test with the client absent, not by import graphs.
