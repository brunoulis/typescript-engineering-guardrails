# Native performance engineering at a TypeScript boundary

TypeScript is the default. Use Rust/C++ only when a demonstrated total advantage or a required existing native capability justifies the integration cost. A language migration is not itself an improvement. This extends the local v2.0.0 methodology; [async performance](async-performance.md) remains the source for cancellation, backpressure and general measurement.

Activate for a representative CPU profile, an existing native dependency/capability, or an explicit interoperability request. AST loops, copies and conversions are investigation candidates, not proof of a bottleneck or instructions to rewrite. No new detector or SDK dependency is required.

## Decide before integrating

| Situation | First choice | Evidence needed to go further |
|---|---|---|
| CRUD, auth, HTTP endpoints without a CPU profile | Keep TypeScript | Actual bottleneck or unavailable capability, not a language comparison |
| Slow SQL | Inspect plans, queries, indexes, round trips and pool behavior | Local compute cost remaining after appropriate database fixes |
| CPU on the request loop | Improve algorithm/data layout; compare a TS worker | Representative profile and end-to-end responsiveness/cost |
| Existing C/C++ library | Evaluate reuse of its capability | Required function, license, ABI, ownership and distribution viability; do not invent a speedup |
| Isolable heavy calculation | Compare a TS worker and native IPC | Startup, transfer, scheduling and total CPU/RAM/tail latency |
| Many small native calls | Batch before crossing | Call cost, bytes/copies, serialization, batch size and p95/p99 |
| Portable compute module | Evaluate Wasm | Host imports/capabilities, memory, conversion and real target support |
| No comparable measurements | Keep current implementation or INCONCLUSIVE | Baseline and representative samples; absent metrics are UNMEASURED |

Retain a backend's existing communicator while it meets requirements. Inspect that actual implementation before claiming anything about it; this guide does not audit it. For a new integration compare stdio IPC and established protocols. HTTP over a Unix socket is an option only where the runtime/API version, OS and deployment support it; verify client/server socket support, permissions and shutdown. It is not a portable default. No transport abstraction or dynamic engine selector is needed merely to discuss alternatives.

Two counterexamples guide the decision. Unprofiled CRUD/slow SQL stays TypeScript with query investigation. Measured isolable CPU makes native a candidate, but an algorithm improvement or TS worker may already satisfy latency and responsiveness. A faster native kernel that increases total RAM, p95/p99 or deployment burden can still be rejected.

## Compare mechanisms, choose one boundary per operation

| Option | Fit | Costs and limits |
|---|---|---|
| Local TS algorithm/data layout | Simplest implementation meeting requirements | Main-loop responsiveness, algorithmic cost and allocations |
| TypeScript worker | CPU isolation while retaining the language/toolchain | Worker startup, message transfer/copies, scheduling, memory and cancellation; not proof of lower total CPU |
| IPC process | Isolable compute or reuse of an existing engine/communicator | Startup, framing/encoding, serialization/copies, bounded streams, subprocess access and join/cleanup; crash isolation is not a sandbox |
| FFI with C ABI | Existing native libraries and batched operations | ABI/CRT, integer widths/layout/alignment, buffers, callbacks, ownership/free rules, blocking and panic/unwind containment; a crash can terminate the host |
| Node-API addon, including napi-rs | Existing npm-native integration | Selected Node-API level, actual addon/runtime compatibility, OS/CPU/libc, dynamic dependencies, package preparation and binary delivery |
| WebAssembly | Portable compute where imports/capabilities fit | Host imports, memory limits/growth, numeric semantics and copies/conversion; host capabilities still need review |

Reserve `deno_core` ops for building/embedding a custom runtime. Do not introduce runtime embedding into a conventional Hono API. Selecting a mechanism does not require implementing demos for the other mechanisms.

## Five guardrails

1. **Justify native work.** Record baseline/candidate, workload, measured bottleneck or required capability, expected benefit and the TS algorithm/worker alternatives. Reject an unmeasured migration; reuse can be justified by functionality without a performance claim.
2. **One boundary, one contract.** Expose one small typed application operation, such as `await analyzeTelemetry({ sessionId, samples, maxLag })`. Keep Hono, auth, input schemas and Drizzle in their existing places. Consumers receive domain results/errors and cancellation, not pointers, allocators, binary paths or transport settings. Validate external input, result and error data at runtime. Define numeric precision/tolerance, overflow/nonfinite values, encoding, bounds and version compatibility when independently deployed peers need it. Reuse [contract guidance](types-and-contracts.md); do not add envelopes to every internal value or factory layers for a single implementation.
3. **Batch before crossing.** Measure operation granularity, bytes, allocations, copies/serialization and p95/p99 under representative load. Do not assume zero-copy or that FFI beats IPC. Bound batch sizes, queues, output and concurrency according to the actual workload.
4. **Own failure and resources.** Define timeout versus abort, overload, crash, malformed/partial output, stream closure, retry/idempotency, concurrency and shutdown. Show that terminated work is joined/cleaned up and capacity recovered; a rejected promise/timer alone is not cancellation. Document buffer/handle ownership, free/dispose pairing, callback lifetime and panic/unwind containment for in-process integrations, including exceptional exits. Use OS isolation policy for any sandbox claim.
5. **Prove the total advantage.** Verify functional equivalence and boundary/resource failures, then compare the same workload and conditions: end-to-end p50/p95/p99, throughput, event-loop delay, CPU across host/workers/children and aggregate memory across the topology, including native allocations. Include warm/cold startup, transport and build/distribution/maintenance costs. Record workload/dataset, hardware/OS/runtime/toolchain/flags and artifact identities, samples/repeats/noise or UNMEASURED; a kernel-only benchmark or `deno bench` does not measure request tails or the process tree. No universal CI speedup threshold.

Use deterministic baseline/candidate fixtures with defined numerical tolerance and limits, plus invalid input/result/error decoding. Exercise actual chosen-runtime boundaries and relevant failure paths, permission denial, missing/incompatible artifacts and shutdown/resource recovery. A generated declaration, mock-only test or build is not consumer execution. Reuse existing fixtures/CI without creating a service or transport per option.

Use the optional [native decision record](../templates/refactor-plan.md) to record baseline, alternatives, contract/mechanism, costs, verification and rollback without duplicating the general report. KEEP_TYPESCRIPT is a valid result; NATIVE_JUSTIFIED needs evidence for the claimed advantage/capability and relevant compatibility/resource/deployment gates. INCONCLUSIVE records missing total-cost evidence rather than approving migration. A measured kernel gain with worse tails, aggregate RAM, distribution or maintenance may justify KEEP_TYPESCRIPT even when its unit benchmark is green.

The example's opt-in [bench/load commands](../examples/deno-native-worker/README.md#reproduce-measurements) retain full IPC costs and scheduled-arrival samples. Uninstrumented process-tree CPU/RAM remain UNMEASURED; a slower native result can justify KEEP_TYPESCRIPT without approving adoption.

## Permissions, provenance and distribution

In Deno, review `--allow-run` for the exact IPC executable and `--allow-ffi` for FFI/Node-API. Native addons require compatible local `node_modules` and prepared binaries; inspect exact package/runtime versions and required preparation scripts before an authorized build/install. Do not execute lifecycle scripts or download binaries implicitly during audit. Avoid blanket `-A` as a fix. See the [Deno profile](runtime-deno.md) and [official permissions](https://docs.deno.com/runtime/fundamentals/security/).

These grants are entry permissions, not a native sandbox. A child can use its OS rights; native code in the host can call the OS outside Deno's JS restrictions. Audit inherited environment, cwd, credentials, file/socket access and OS/container restrictions. Distinguish trusted build-tool permissions from runtime permissions and crash isolation from security containment.

Record binary origin/hash, locked source/dependencies, generator/tool/runtime versions, build/preparation commands, target OS/CPU/libc/CRT, dynamic libraries and the exact artifact loaded/launched by the tested consumer. Version generated bindings together with their native library; review regeneration/diffs. Type generation and explicit disposal syntax do not prove ABI, lifetime, exceptional cleanup or thread safety. Match release package to exercised artifact. Test missing/incompatible binaries and clear startup failure; cross-build success is not execution on the target. Node-API compatibility in Node does not establish the specific addon on Deno. Verify that the real deployment permits processes/native loading and ships the required files.

## Projects to study, not mandatory dependencies

These are documentary lessons, not claims that their suites were executed or their APIs fit a target project. Source snapshots below were consulted on 2026-11-17; apply SKILL R0a to the exact resolved version before adopting APIs. Current websites can change; use matching tagged source/declarations/tests where versioned docs are unavailable.

| Source / inspected scope | Bounded lesson and remaining proof |
|---|---|
| Deno: existing example/data evidence targets 2.9.8; [v2.9.8 source](https://github.com/denoland/deno/tree/v2.9.8), current [Node/npm guide](https://docs.deno.com/runtime/fundamentals/node/) and [permissions](https://docs.deno.com/runtime/fundamentals/security/) | Runtime permissions, process/resource lifecycle and native package preparation must match the deployment. These guides do not prove a specific addon or other runtime/target. |
| deno_bindgen: [README at b8e80c6](https://github.com/denoland/deno_bindgen/blob/b8e80c6b169f110d6ebb36a06b670e987be1d141/README.md) and [manifest at the same revision](https://github.com/denoland/deno_bindgen/blob/b8e80c6b169f110d6ebb36a06b670e987be1d141/deno_bindgen/Cargo.toml) | Generated typings and explicit handle disposal are useful design lessons. README discusses 0.10 while this manifest says 0.9.0-alpha: do not infer a coherent release/installed version or compatible ABI. Establish generator/library/runtime versions and test disposal/lifetime before adoption. No installation is required here. |
| napi-rs: official [v3 guide](https://napi.rs/docs/introduction/getting-started); [Node-API in Node 24.22.1](https://nodejs.org/download/release/v24.22.1/docs/api/n-api.html) | A small consumable addon API and platform package distribution are useful. Node-API ABI stability has scope; verify Node-API level, external libraries and the exact napi-rs/addon/runtime/target, especially Deno. |
| Sharp: [v0.34.5 utility reference](https://github.com/lovell/sharp/blob/v0.34.5/docs/src/content/docs/api-utility.md) | A compact JS API can own substantial native work. Cache, queues, native thread concurrency and component versions remain part of the total resource cost, not evidence that more threads improve a service. |
| SQLite: [C statement lifecycle](https://www.sqlite.org/c3ref/finalize.html), contrasted with a specific wrapper such as [node-sqlite3 v5.1.7](https://raw.githubusercontent.com/TryGhost/node-sqlite3/v5.1.7/README.md) | Distinguish the C engine from npm/JSR/FFI wrappers called sqlite3. Determine actual wrapper and linked engine versions, connection/statement ownership, errors and close behavior; C lifecycle docs do not prove wrapper or Deno compatibility. |
| deno_core: [0.413.0 API](https://docs.rs/deno_core/0.413.0/deno_core/) | Runtime embedding and ops are a separate host architecture. This version reference is not a dependency recommendation for a web API. |

For HTTP over a Unix socket, [Node 24.22.1 HTTP](https://nodejs.org/download/release/v24.22.1/docs/api/http.html#serverlisten) is one versioned starting point; verify the actual runtime's server/client API and platform rather than copying Node support to Bun/Deno.

The [stdio worker example](../examples/deno-native-worker/README.md) supplies a TS baseline and one Rust operation behind a batched domain API. Its own recorded evidence governs equivalence/lifecycle/platform claims; it does not authorize replacing a backend communicator or establish production performance. TypeScript owns integration, validation, permissions and consumer experience. If available and relevant, consult **rust-engineering-guardrails** for algorithm/ownership/worker lifecycle or **cpp-engineering-guardrails** for an actual C/C++ library's ABI/toolchain/consumer proof. These independently distributed skills are optional; no sibling path or installation is required to use this guide.
