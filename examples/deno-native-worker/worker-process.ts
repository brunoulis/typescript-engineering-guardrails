import type { AnalysisOptions } from "./types/analysis.ts";
import { AnalysisError } from "./errors.ts";
import { validateOptions } from "./schemas/analysis.ts";
import {
  MAX_PROCESSES,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_STDERR_BYTES,
} from "./constants/limits.ts";

let active = 0;

/** Internal transport; consumers use analyzeTelemetry. */
export async function runWorker(
  executable: URL,
  request: Uint8Array,
  options: AnalysisOptions,
): Promise<Uint8Array> {
  const timeoutMs = validateOptions(options);
  const signal = options.signal;
  if (request.byteLength > MAX_REQUEST_BYTES) {
    throw new AnalysisError("INVALID_INPUT");
  }
  if (signal?.aborted) throw new AnalysisError("ABORTED");
  if (active >= MAX_PROCESSES) throw new AnalysisError("BUSY");
  active++;
  try {
    let child: Deno.ChildProcess;
    try {
      child = new Deno.Command(executable, {
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        clearEnv: true,
      }).spawn();
    } catch {
      throw new AnalysisError("UNAVAILABLE");
    }

    let failure: AnalysisError | undefined;
    const stop = (error: AnalysisError) => {
      if (failure) return;
      failure = error;
      try {
        child.kill("SIGKILL");
      } catch {
        // Exit may win this race (Windows can report EPERM for an exited child).
        // Preserve the first failure; status and every stream are still joined below.
      }
    };
    const aborted = () => stop(new AnalysisError("ABORTED"));
    signal?.addEventListener("abort", aborted, { once: true });
    const timer = setTimeout(
      () => stop(new AnalysisError("TIMEOUT")),
      timeoutMs,
    );
    const read = async (
      stream: ReadableStream<Uint8Array>,
      limit: number,
      enforce: boolean,
    ): Promise<Uint8Array> => {
      const chunks: Uint8Array[] = [];
      let retained = 0;
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const available = limit - retained;
          if (value.length > available && enforce) {
            stop(new AnalysisError("PROTOCOL"));
          }
          if (available > 0) {
            const part = value.slice(0, available);
            chunks.push(part);
            retained += part.length;
          }
          // Continue draining stderr even after its retention cap.
        }
      } catch {
        stop(new AnalysisError("NATIVE_FAILURE"));
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(retained);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    };
    const write = async () => {
      const writer = child.stdin.getWriter();
      try {
        await writer.write(request);
        await writer.close();
      } catch {
        stop(new AnalysisError("NATIVE_FAILURE"));
      } finally {
        writer.releaseLock();
      }
    };
    try {
      const [status, stdout] = await Promise.all([
        child.status,
        read(child.stdout, MAX_RESPONSE_BYTES, true),
        read(child.stderr, MAX_STDERR_BYTES, false),
        write(),
      ]);
      if (failure) throw failure;
      if (!status.success) throw new AnalysisError("NATIVE_FAILURE");
      return stdout;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
    }
  } finally {
    active--;
  }
}
