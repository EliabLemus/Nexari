import type {
  BoltTerminalSeam,
  BrowserRuntime,
  ExecCaptureOptions,
  ExecCaptureResult,
  RuntimeProcess,
} from '../../runtime-contract/dist/index.js';

/**
 * Create the proven Delta 002 replacement for Bolt's JSH/OSC terminal protocol.
 *
 * This adapter deliberately owns no prompt parsing or OSC emulation. Consumers
 * use `repl.output` to accumulate the banner and structural prompt draws, while
 * action-style commands use the fresh `sh -c` exec lane for exit status.
 */
export async function createBoltTerminalSeam(runtime: BrowserRuntime): Promise<BoltTerminalSeam> {
  // The interactive process must be uncapped: do not pass terminal/capture
  // options. Vivari's interactive stdin lane depends on that exact spawn shape.
  const replProcess = await runtime.spawn('sh', []);
  let replAlive = true;
  const writer = replProcess.input.getWriter();

  const markReplStopped = () => {
    replAlive = false;
    try {
      writer.releaseLock();
    } catch {
      // A released writer is already inert.
    }
  };
  // Handle both settlement paths so a killed guest cannot create an unhandled
  // rejection or leave the synchronous sendStdin gate falsely alive.
  void replProcess.exit.then(markReplStopped, markReplStopped);

  return {
    repl: {
      output: replProcess.output,
      get alive() {
        return replAlive;
      },
      sendStdin(data: string): boolean {
        if (!replAlive) return false;
        // The public seam is deliberately synchronous. A later stream failure
        // closes the lane; it must not become an unhandled rejection.
        void writer.write(data).catch(markReplStopped);
        return true;
      },
      stop(): void {
        if (!replAlive) return;
        markReplStopped();
        try {
          replProcess.kill();
        } catch {
          // Guest teardown may already have stopped the process.
        }
      },
    },
    exec: {
      async exec(command: string, options?: ExecCaptureOptions): Promise<ExecCaptureResult> {
        if (options?.signal?.aborted) throw options.signal.reason;
        const process = await runtime.spawn('sh', ['-c', command], execSpawnOptions(options));
        const [stdout, stderr, code] = await Promise.all([
          readText(process.stdout),
          readText(process.stderr),
          process.exit,
        ]);
        return { code, stdout, stderr };
      },
    },
  };
}

function execSpawnOptions(options: ExecCaptureOptions | undefined): {
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
} | undefined {
  if (!options) return undefined;
  const { cwd, env, signal } = options;
  return { ...(cwd === undefined ? {} : { cwd }), ...(env === undefined ? {} : { env }), ...(signal === undefined ? {} : { signal }) };
}

async function readText(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += value;
    }
  } finally {
    reader.releaseLock();
  }
}
