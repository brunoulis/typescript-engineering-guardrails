import { deepStrictEqual, ok, rejects } from "node:assert/strict";
import { runWorker } from "./worker-process.ts";
import { parseResponse } from "./schemas/analysis.ts";

const suffix = Deno.build.os === "windows" ? ".exe" : "";
const fixture = new URL(
  `./worker/target/release/fault_fixture${suffix}`,
  import.meta.url,
);
const worker = new URL(
  `./worker/target/release/telemetry-worker${suffix}`,
  import.meta.url,
);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fixtureRequest = (mode: string, extra: object = {}) =>
  encoder.encode(JSON.stringify({ mode, ...extra }) + "\n");

Deno.test("real worker validates malformed requests and domain values", async () => {
  const badInputs = [{}, { sessionId: "x", samples: [1], maxLag: 1 }, {
    sessionId: "x",
    samples: [1, 2],
    maxLag: 1.5,
  }, { sessionId: "x", samples: [1, 1000001], maxLag: 1 }];
  for (const input of badInputs) {
    deepStrictEqual(
      JSON.parse(
        decoder.decode(
          await runWorker(
            worker,
            encoder.encode(JSON.stringify({ version: 1, input })),
            {},
          ),
        ),
      ),
      { version: 1, error: "INVALID_INPUT" },
    );
  }
  for (const request of ["{", '{"version":2,"input":{}}']) {
    deepStrictEqual(
      JSON.parse(
        decoder.decode(await runWorker(worker, encoder.encode(request), {})),
      ),
      { version: 1, error: "PROTOCOL" },
    );
  }
});

Deno.test("transport bounds request and response, drains capped stderr, recovers slots", async () => {
  await rejects(runWorker(fixture, new Uint8Array(4 * 1024 * 1024 + 1), {}), {
    code: "INVALID_INPUT",
  });
  await rejects(runWorker(fixture, fixtureRequest("oversize"), {}), {
    code: "PROTOCOL",
  });
  const result = await runWorker(fixture, fixtureRequest("stderr"), {});
  deepStrictEqual(decoder.decode(result), "ok");
  deepStrictEqual(
    decoder.decode(await runWorker(fixture, fixtureRequest("echo"), {})),
    "ok",
  );
});

Deno.test("nonzero exit and early input closure produce sanitized errors", async () => {
  for (const mode of ["crash", "close-input"]) {
    const header = fixtureRequest(mode);
    const payload = new Uint8Array(2 * 1024 * 1024);
    payload.set(header);
    await rejects(async () => {
      const bytes = await runWorker(fixture, payload, {});
      parseResponse(bytes, { sessionId: "test", samples: [1, 2], maxLag: 1 });
    }, (error: unknown) => {
      ok(error instanceof Error);
      const code: unknown = Object.getOwnPropertyDescriptor(error, "code")
        ?.value;
      if (mode === "crash") deepStrictEqual(code, "NATIVE_FAILURE");
      else ok(code === "NATIVE_FAILURE" || code === "PROTOCOL");
      ok(!error.message.includes("sensitive"));
      ok(!error.message.includes("target"));
      return true;
    });
  }
});

async function waitForPid(path: string): Promise<number> {
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    try {
      const pid = Number(await Deno.readTextFile(path));
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("fixture did not start");
}

Deno.test("abort and timeout kill child during partial stdin and await closed streams", async () => {
  await Deno.mkdir(new URL("./.test-artifacts/", import.meta.url), {
    recursive: true,
  });
  for (const mode of ["hold-input", "partial-output"]) {
    for (const reason of ["ABORTED", "TIMEOUT"] as const) {
      const pidPath =
        `${import.meta.dirname}/.test-artifacts/${crypto.randomUUID()}.pid`;
      const controller = new AbortController();
      const header = fixtureRequest(mode, { pidPath });
      const payload = new Uint8Array(4 * 1024 * 1024);
      payload.set(header);
      const operation = runWorker(fixture, payload, {
        signal: controller.signal,
        timeoutMs: reason === "TIMEOUT" ? 500 : 3000,
      });
      const rejection = rejects(operation, { code: reason });
      // Observe immediately while startup receipts are polled; preserve assertion below.
      rejection.catch(() => {});
      try {
        const pid = await waitForPid(pidPath);
        if (reason === "ABORTED") controller.abort();
        await rejection;
        ok(Number.isInteger(pid) && pid > 0);
        // Retain PID receipts for an external OS existence check. Deno.kill(pid, 0)
        // requires unrestricted allow-run; do not widen the runtime permissions.
        deepStrictEqual(
          decoder.decode(await runWorker(fixture, fixtureRequest("echo"), {})),
          "ok",
        );
      } finally {
        controller.abort();
        await rejection;
      }
    }
  }
});

Deno.test("response boundary validates version, identity, finite values, shape and UTF-8", async () => {
  const input = { sessionId: "test", samples: [1, 2, 3], maxLag: 2 };
  const invalid = [
    "",
    "{",
    JSON.stringify({
      version: 2,
      result: { sessionId: "test", correlations: [4, 3] },
    }),
    JSON.stringify({
      version: 1,
      result: { sessionId: "other", correlations: [4, 3] },
    }),
    JSON.stringify({
      version: 1,
      result: { sessionId: "test", correlations: [4] },
    }),
    JSON.stringify({
      version: 1,
      result: { sessionId: "test", correlations: [null, 3] },
    }),
    JSON.stringify({
      version: 1,
      result: { sessionId: "test", correlations: ["4", 3] },
    }),
    '{"version":1,"result":{"sessionId":"test","correlations":[1e400,3]}}',
    JSON.stringify({
      version: 1,
      result: { sessionId: "test", correlations: [1e12 + 1, 3] },
    }),
    JSON.stringify({
      version: 1,
      result: { sessionId: "test", correlations: [4, 3] },
      extra: true,
    }),
    JSON.stringify({ version: 1, error: "sensitive arbitrary error" }),
  ];
  for (const response of invalid) {
    await rejects(
      async () =>
        parseResponse(
          await runWorker(
            fixture,
            fixtureRequest("response", { response }),
            {},
          ),
          input,
        ),
      { code: "PROTOCOL" },
    );
  }
  await rejects(
    async () =>
      parseResponse(
        await runWorker(fixture, fixtureRequest("invalid-utf8"), {}),
        input,
      ),
    { code: "PROTOCOL" },
  );
  for (const code of ["INVALID_INPUT", "PROTOCOL"] as const) {
    const response = JSON.stringify({ version: 1, error: code });
    await rejects(
      async () =>
        parseResponse(
          await runWorker(
            fixture,
            fixtureRequest("response", { response }),
            {},
          ),
          input,
        ),
      { code },
    );
  }
});

Deno.test("third concurrent batch rejects BUSY, aborted batches release admission", async () => {
  await Deno.mkdir(new URL("./.test-artifacts/", import.meta.url), {
    recursive: true,
  });
  const firstPidPath =
    `${import.meta.dirname}/.test-artifacts/${crypto.randomUUID()}.pid`;
  const secondPidPath =
    `${import.meta.dirname}/.test-artifacts/${crypto.randomUUID()}.pid`;
  const first = new AbortController();
  const second = new AbortController();
  const a = runWorker(
    fixture,
    fixtureRequest("hold-input", { pidPath: firstPidPath }),
    {
      signal: first.signal,
    },
  );
  const b = runWorker(
    fixture,
    fixtureRequest("hold-input", { pidPath: secondPidPath }),
    {
      signal: second.signal,
    },
  );
  const checkedA = rejects(a, { code: "ABORTED" });
  const checkedB = rejects(b, { code: "ABORTED" });
  checkedA.catch(() => {});
  checkedB.catch(() => {});
  try {
    const [firstPid, secondPid] = await Promise.all([
      waitForPid(firstPidPath),
      waitForPid(secondPidPath),
    ]);
    ok(firstPid !== secondPid);
    await rejects(runWorker(fixture, fixtureRequest("echo"), {}), {
      code: "BUSY",
    });
  } finally {
    first.abort();
    second.abort();
    await Promise.all([checkedA, checkedB]);
  }
  deepStrictEqual(
    decoder.decode(await runWorker(fixture, fixtureRequest("echo"), {})),
    "ok",
  );
});

Deno.test("unavailable executable is sanitized and releases admission", async () => {
  await rejects(
    runWorker(
      new URL("./worker/target/release/missing-worker", import.meta.url),
      encoder.encode("{}"),
      {},
    ),
    (error: unknown) => {
      ok(error instanceof Error);
      deepStrictEqual(
        Object.getOwnPropertyDescriptor(error, "code")?.value,
        "UNAVAILABLE",
      );
      ok(!error.message.includes("missing-worker"));
      return true;
    },
  );
  deepStrictEqual(
    decoder.decode(await runWorker(fixture, fixtureRequest("echo"), {})),
    "ok",
  );
});
