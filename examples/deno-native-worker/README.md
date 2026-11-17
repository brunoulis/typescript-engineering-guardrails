# Deno + a Rust worker per telemetry batch

This isolated example demonstrates a small asynchronous operation with a bounded
native process lifecycle. It does **not** establish that migrating a TypeScript
application is worthwhile. The opt-in benchmark/load commands compare the whole
operation. Keep TypeScript unless representative evidence justifies native
integration; a negative native result is useful evidence.

```typescript
import { AnalysisError, analyzeTelemetry } from "./engine-client.ts";

try {
  const result = await analyzeTelemetry({
    sessionId: "session-1",
    samples: [1, 2, 3],
    maxLag: 2,
  }, { timeoutMs: 5000 });
  console.log(result); // { sessionId: "session-1", correlations: [4, 3] }
} catch (error) {
  if (error instanceof AnalysisError) console.error(error.code);
  else throw error;
}
```

## Build and verify

Run from this directory with **Deno 2.9.8** and **Rust/Cargo 1.96.0**. Deno uses
built-in APIs only, including `node:assert/strict` and `node:url` in tests; no
Deno dependency resolution or lockfile is needed. Cargo dependencies and their
checksums are pinned in `worker/Cargo.lock`. The compiler is the installed 1.96
toolchain; no command installs or updates a toolchain.

Use a short checkout path on Windows. An excessively nested verification copy
failed in MSVC's linker with `LNK1104` for long build-output paths; the complete
flow passed after copying the same source to a shorter path containing spaces.

```sh
deno task build:native
deno task check
deno task test
cd worker
cargo test --locked
cargo build --release --locked --bin telemetry-worker
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
```

`build:native` invokes Cargo and builds both release binaries. Building runs
trusted build tools with the invoking user's OS permissions; these differ from
the Deno runtime permissions below. The operation never builds or downloads on
import. The main binary must exist at `worker/target/release/telemetry-worker`
(`.exe` on Windows), relative to this module. Preserve this layout when
packaging. A missing, incompatible or non-executable binary yields
`UNAVAILABLE`; a worker which starts and exits unsuccessfully yields
`NATIVE_FAILURE`.

The test task grants execution only for those exact main/fixture release paths
(both platform suffixes), and read/write only for `.test-artifacts` PID
receipts. It grants no network, environment, FFI or unrestricted execution
permission. Deno still allows local static module loading. Resource and
async-operation sanitizers remain enabled. Permission tests remove execution
entirely, then allow only the fixture, and observe `UNAVAILABLE` from the public
operation in both cases.

For an application entry point `app.ts`, the runtime needs only its exact worker
execution permission:

```sh
# Linux-shaped path (Linux execution is UNVERIFIED):
deno run --no-prompt --allow-run=./worker/target/release/telemetry-worker app.ts
# Windows:
deno run --no-prompt --allow-run=./worker/target/release/telemetry-worker.exe app.ts
```

The native executable itself has normal OS access. Deno's execution allowlist
does not sandbox Rust or protect against replacement of an allowed binary. Ship
and protect a binary built from the locked source for the target platform.

## Contract and limits

For each lag `k = 1..maxLag`, both implementations accumulate
`samples[i] * samples[i+k]` in increasing `i`, then divide by `n-k`. The samples
are not centered. There is no reassociation, parallel reduction or fast-math
mode. The differential tests compare finite results with tolerance
`abs(actual - expected) <= 1e-10 * max(1, abs(expected))`.

Input validation in TypeScript and Rust requires:

- A nonempty, well-formed Unicode `sessionId` of at most 128 UTF-16 code units
  (the same length rule as JavaScript strings; Rust counts `encode_utf16()`
  units). Isolated high/low surrogates are rejected as `INVALID_INPUT` by both
  the baseline and native client before JSON serialization; valid surrogate
  pairs remain accepted.
- 2–100000 samples, each finite and in [-1000000, 1000000].
- An integer `maxLag` from 1 to `min(64, samples.length - 1)`.

These are this example's limits. They do not define Paceforge's algorithm or
general telemetry constraints. The baseline is
`analyzeInTypeScript(input): AnalysisResult`; the public native operation is
`analyzeTelemetry(input, {signal?, timeoutMs?}): Promise<AnalysisResult>`.
Inputs are serialized before the first asynchronous wait. The public API accepts
no executable, shell command, pool or transport configuration.

Each admitted batch starts one process without a shell or inherited environment,
sends one version-1 JSON request on stdin, closes stdin, validates one JSON
response, and waits for process exit and completion of stdin/stdout/stderr. The
request is `{version:1,input}`; the response is `{version:1,result}` or a
validated `{version:1,error:"INVALID_INPUT"|"PROTOCOL"}` envelope. Unknown
versions, extra fields, wrong session IDs, wrong correlation count, malformed
JSON/UTF-8 and nonfinite/out-of-domain result values are rejected.

Admission is limited to two active processes **per Deno isolate/module
instance**, with immediate `BUSY` rejection and no waiting queue or retries. The
default timeout is 5000ms; overrides are integer milliseconds in [1, 2147483647]
to avoid timer overflow. Request bytes are capped at 4MiB and stdout at 64KiB.
Stderr keeps at most 64KiB while continuing to drain; no stderr, executable path
or raw cause is included in public errors. Cancellation/timeout/output overflow
kills the owned child and joins all its streams before releasing admission. The
trusted worker does not create descendants; supervising arbitrary process trees
is outside this example. As with any JS timer, timeout dispatch depends on the
event loop being able to run.

| Public error     | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| `INVALID_INPUT`  | Domain/options/request budget invalid           |
| `ABORTED`        | Caller cancellation                             |
| `TIMEOUT`        | Execution exceeded its timer budget             |
| `BUSY`           | Two admitted processes are still active         |
| `UNAVAILABLE`    | Spawn denied or binary unavailable/incompatible |
| `PROTOCOL`       | Output budget or response contract violated     |
| `NATIVE_FAILURE` | Nonzero exit or transport I/O failure           |

The first terminal failure wins races. An early successful child exit may leave
a write buffered by the OS: the final response validator still rejects an empty
or partial response. Tests therefore accept a transport failure or a protocol
error for early input closure; a nonzero exit must be `NATIVE_FAILURE`.

## Lifecycle evidence and platforms

Tests exercise the real **release** worker and the separately built
`fault_fixture` test executable. The fixture covers stderr flooding, stdout
overflow, crash, early input closure, partial output, and unread 4MiB input. It
is not a production worker mode. Abort and timeout tests save child PIDs under
`.test-artifacts`, recover the admission slot, and complete with Deno's resource
and async-operation sanitizers enabled. The saturation test waits for the PID
receipts of both holding fixtures before requesting the third batch and
asserting `BUSY`, then aborts and joins both before checking admission recovery.

On Windows, externally check that receipt PIDs no longer exist after tests:

```powershell
Get-ChildItem -LiteralPath .test-artifacts -Filter *.pid | ForEach-Object {
  $fixturePid = [int](Get-Content -LiteralPath $_.FullName)
  if (Get-Process -Id $fixturePid -ErrorAction SilentlyContinue) {
    throw "Child $fixturePid remains alive (check for PID reuse)"
  }
}
```

An external OS check avoids widening Deno permissions: `Deno.kill(pid, 0)`
requires unrestricted execution permission in Deno 2.9.8. Receipts are ignored
build/test artifacts; check promptly to avoid unrelated OS PID reuse.

| Platform    | Status     | Executed environment                                                                                                   |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows x64 | PASS       | Windows 11 Pro 10.0.26200, Intel i9-12900K; Deno 2.9.8, Rust 1.96.0 MSVC; release build, tests and PID absence checked |
| Linux       | UNVERIFIED | No Linux runtime available in this execution environment; a cross-build would not establish execution                  |
| macOS       | UNVERIFIED | Not executed                                                                                                           |

No deployment readiness or other platform support is claimed. The example adds
no C++ dependency, persistent pool or FFI.

## Reproduce measurements

Build separately with `deno task build:native`, then run three fresh, sequential
invocations of each command, without competing benchmarks. Create an output
directory outside the checkout and adapt redirection syntax to your shell:

```sh
deno task bench --json > /outside-checkout/bench.json 2> /outside-checkout/bench-metadata.log
deno task load > /outside-checkout/load.jsonl 2> /outside-checkout/load-command.log
```

These explicit tasks neither build nor download. They grant execution and
SHA-256 read access only to the exact main release binary (both platform
spellings). Ordinary audit/check/test tasks do not benchmark or build.

`benchmark.ts` registers twelve `Deno.bench` cases: 1000, 10000 and 100000
samples, 64 lags, and two orders (TS→IPC, IPC→TS). Deterministic sample `i` is
`((i * 48271) % 65521 - 32760) / 1024`. Each case requests three warmups and
thirty iterations; Deno may calibrate beyond these suggestions. Keep actual `n`,
min/max, p75/p99 and runtime in the raw JSON. Deno 2.9.8 emits JSON format
version 1, marked unstable by the CLI. Require twelve successful results; exit 0
alone does not establish execution. Stderr metadata
(`telemetry-bench-config-v1`) records runtime/target, input and binary hashes,
build command and configuration.

Explicit timers include the operation and exclude parity assertions. IPC
includes validation, JSON, startup, stdio transport, response
decoding/validation, stream joins and process teardown. TS uses the optimized
ascending-index baseline with the same input, validation and calculation. No
standalone Rust-kernel timing or kernel speedup is claimed.

`load.ts` emits `telemetry-load-v1` metadata and four cases: both engines with
admission limits 1 and 2, alternating engine order. Every case offers 120
arrivals ten milliseconds apart (100 batches/s), with 100000 samples and 64
lags. Original scheduled timestamps survive late dispatch, and early timer
wakeups wait again. Latency includes scheduler lateness through completion;
overdue arrivals are retained rather than omitted or rescheduled according to
completions. There is no native waiting queue or retry. TS executes
synchronously on one main thread at both limits; limit 2 does not claim TS
parallelism.

Raw rows contain scheduled/start/completion offsets in milliseconds from the
case origin and an outcome. `ADMISSION_BUSY` denotes generator admission
rejection; `BUSY` denotes the real client's two-process rejection. Summaries
separate admitted requests, successes and each error. Nearest-rank p50/p95/p99
come from actual rows. Successful tails are separate from all-outcome tails,
since quick rejections can lower all-outcome percentiles. Throughput divides
successes by the offered window or drain duration, whichever is longer. Raw loop
delay samples cover every elapsed ten-millisecond heartbeat opportunity,
including overdue ticks, with percentiles and maximum. This coarse same-isolate
probe includes timer resolution/phasing; 120 arrivals give coarse p99
resolution. It is not an external traffic test or a production SLO.

Total Deno-plus-children CPU/RAM are **UNMEASURED**: no adequate process-tree
sampler was run (frequency N/A). Ordinary OS polling can miss short-lived Rust
children. Deno heap/RSS is not substituted for the total. Future collection must
capture host and active children at the same timestamps, include child lifetimes
and CPU, document sampling frequency and shared-RSS double counting, and compare
concurrent aggregates/peaks rather than summing peaks from different times. A
Deno profile cannot measure Rust CPU. The TS-worker alternative is
**UNVERIFIED**; responsiveness differences cannot be attributed to Rust rather
than offloading.

## Distribution and adoption

Record source revision, lockfile, toolchain/target, OS/CPU, release
command/flags and SHA-256 for the artifact actually launched. Preserve the fixed
release path. The measured Windows artifact uses Cargo's default release profile
(opt-level 3, no custom LTO, target-cpu, reassociation or fast-math flags). MSVC
PE imports include KERNEL32, ntdll, VCRUNTIME140 and Windows API-set/UCRT
runtime, math, stdio, locale and heap libraries. Ship the appropriate MSVC/UCRT
prerequisites and verify launch on the actual deployment. Linux/macOS remain
UNVERIFIED. Existing missing/incompatible/permission and lifecycle checks are
correctness gates; microbenchmark speed is never a hosted-runner gate. Future
FFI/Node-API would additionally need ABI/CRT/libc, ownership/disposal,
node_modules and exact runtime/addon compatibility evidence; none is implemented
here.

Choose `KEEP_TYPESCRIPT` when full IPC is slower or fails the required
advantage; rejecting adoption does not require measuring every remaining cost.
Choose `ADOPT_NATIVE` only with adequate evidence for the benefit and relevant
total resource/platform/distribution requirements; use `INCONCLUSIVE` for
unresolved evidence without implying adoption. Account for noise, tails,
overload and maintaining Rust/serde/toolchains/platform artifacts. Roll back to
the TS baseline or retain the application's existing communicator. There is no
universal minimum speedup. The coordinating local Windows measurements chose
**KEEP_TYPESCRIPT**; their raw evidence and limitations live in its separate
verification report, not as a bundled performance promise.
