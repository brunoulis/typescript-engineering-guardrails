# Deno profile

- Deno 2+ supports Node/npm interoperability but not every API/package behavior identically. Read `deno.json`, `package.json`, import maps, `deno.lock`, permissions, deployment target and npm native addons.
- For production, grant the narrowest practical permissions: `--allow-net` scoped hosts, `--allow-env` keys, read/write paths, FFI when justified. Blanket `-A` is a review signal, not always forbidden (trusted tooling/build).
- Use existing `deno fmt`, `deno lint`, `deno check`, `deno test`, `deno task`; document which actually ran. Deno's default typing/tool behavior is version-dependent; do not force tsconfig unrelated to repository.
- Verify Node npm drivers, `nodeModulesDir`, postinstall, FFI, `node:` imports and deployment permissions. Track startup, connection pools and termination, especially in serverless environments.
- Source: https://docs.deno.com/runtime/fundamentals/configuration/ and https://docs.deno.com/runtime/fundamentals/node/
