/**
 * Bolt.DIY terminal seam — the two-lane replacement protocol proven by
 * Delta 002 (scripts/check-bolt-terminal-contract.test.mjs, 6 tests, green).
 *
 * Bolt's pinned shell (bolt.diy app/utils/shell.ts @ 2e254ac1) spawns
 * `/bin/jsh --osc` and gates its whole command lifecycle on OSC 654:
 * `\x1b]654;interactive\x07` enables input, `\x1b]654;exit=<code>:<row>\x07`
 * reports completion, and an OSC 'prompt' marks the next command boundary.
 *
 * Nexari's clean-room sh NEVER emits OSC 654. The replacement protocol
 * documented here splits into two lanes:
 *
 *   1. Interactive REPL lane — for Bolt's terminal UI (prompt, echo, SIGINT)
 *   2. Exec exit-capture lane — for Bolt's action runner (sh -c → exit code)
 *
 * A Bolt-side facade (Delta 003) implements BoltShell by composing both lanes.
 * The facade must NOT emulate OSC 654; it must replace BoltShell entirely.
 */

// ---------------------------------------------------------------------------
// Interactive REPL lane — replaces BoltShell's jsh --osc interactive session
// ---------------------------------------------------------------------------

/**
 * The one-time startup banner emitted by Nexari's clean-room interactive sh.
 * Plain text, no ANSI, cwd-independent: the drift-stable readiness sentinel.
 *
 * Evidence: scripts/check-bolt-terminal-contract.test.mjs AC-1
 */
export const REPL_BANNER = 'Vivari shell — type commands, Enter to run.\n';

/**
 * Structural shape of the ANSI prompt drawn by the interactive sh.
 * Not byte-exact: the cwd segment legitimately changes with `cd`.
 *
 * Evidence: scripts/check-bolt-terminal-contract.test.mjs AC-1
 */
export const PROMPT_SHAPE = /\x1b\[36m[^\x1b]*\$\x1b\[0m /;

/**
 * Interactive REPL lane — the replacement for Bolt's `waitTillOscCode('interactive')`
 * and `waitTillOscCode('prompt')` gate sequences.
 *
 * Readiness: the output stream starts with `REPL_BANNER` followed by a prompt draw.
 * Command round-trip: typed stdin → echoed output → later prompt redraw.
 * Exit codes: NOT observable. The REPL's drain() discards runLine's status
 *   and the lexer has no $? expansion. The facade must not claim 130/143
 *   propagation for SIGINT'd children — the REPL resolves code==null as 0.
 * Interrupt: \x03 SIGINTs the foreground child, the prompt restores, and a
 *   follow-up command still executes. The child's numeric exit code is
 *   intentionally never surfaced.
 *
 * Stale input: sendStdin to a stopped/unknown pid returns false and revives nothing.
 *
 * CRITICAL: the interactive sh MUST be spawned UNCAPPED (no capture, no explicit
 * tty). Spawning with capture flips fd 0 to the kernel's synchronous EOF path
 * and the REPL never sees keystrokes. The exec-capture lane uses capture; the
 * REPL lane must not.
 *
 * Stream consumption discipline: ANSI prompt draws may straddle ReadableStream
 * chunk boundaries. Consumers MUST accumulate chunks and regex-match the
 * accumulated text — never match per-chunk. The kernel-level proof
 * (scripts/check-bolt-terminal-contract.test.mjs) uses Buffer.concat to
 * accumulate; the facade must follow the same discipline.
 *
 * Evidence: scripts/check-bolt-terminal-contract.test.mjs AC-1 through AC-5
 */
export interface InteractiveReplLane {
  /** Send raw bytes to the interactive shell's stdin (keystrokes, commands, Ctrl+C). */
  sendStdin(data: string): boolean;

  /**
   * Observe the raw output stream (banner + prompts + echoed commands + output).
   * The consumer gates readiness on the banner and prompt draws; it does NOT
   * gate on OSC 654.
   */
  readonly output: ReadableStream<string>;

  /** Stop the interactive shell. Subsequent sendStdin returns false. */
  stop(): void;

  /** Whether the interactive shell is still running. */
  readonly alive: boolean;
}

// ---------------------------------------------------------------------------
// Exec exit-capture lane — replaces BoltShell's OSC 654 exit= parsing
// ---------------------------------------------------------------------------

/**
 * Result of a one-shot exec captured through the `sh -c` lane.
 *
 * This is the replacement for Bolt's `\x1b]654;exit=<code>:<row>\x07` parsing.
 * Exit code propagation for success (0), explicit failure (N), and typed
 * not-found (127) is proven by scripts/check-runtime-shell-coreutils.test.mjs;
 * the success leg is also pinned by scripts/check-bolt-terminal-contract.test.mjs AC-3.
 */
export interface ExecCaptureResult {
  /** Process exit code. 0 = success, N = explicit failure, 127 = command not found. */
  readonly code: number;
  /** Captured stdout. */
  readonly stdout: string;
  /** Captured stderr. */
  readonly stderr: string;
}

/**
 * Exec exit-capture lane — the replacement for Bolt's OSC exit-code parsing.
 *
 * Commands that need an exit code (action runner, git hooks) must use this
 * lane instead of the interactive REPL. The interactive REPL's drain()
 * discards the exit code; this lane preserves it.
 *
 * Lane divergence (AC-2b): the exec lane starts from its spawn cwd and env,
 * NOT from the REPL's interactive cwd/env. If the facade needs both, it must
 * fork the exec command from a fresh `sh -c` invocation, not from the REPL.
 *
 * Evidence: scripts/check-bolt-terminal-contract.test.mjs AC-2b, AC-3
 */
export interface ExecCaptureLane {
  /**
   * Execute a command through `sh -c` with full exit-code capture.
   * The command runs in a fresh process — it does NOT inherit the REPL's
   * interactive cwd or environment unless explicitly passed.
   */
  exec(command: string, options?: ExecCaptureOptions): Promise<ExecCaptureResult>;
}

/** Options for the exec-capture lane. */
export interface ExecCaptureOptions {
  /** Working directory for the exec. Defaults to '/'. */
  cwd?: string;
  /** Environment variables for the exec. */
  env?: Record<string, string>;
  /**
   * Abort signal for cancellation. If aborted before the exec resolves,
   * the promise rejects with the abort reason. Mirrors RuntimeSpawnOptions.signal
   * so long-lived commands (e.g. npm install) have a cancellation path.
   */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Combined seam — what a Bolt-side facade implements
// ---------------------------------------------------------------------------

/**
 * Bolt terminal seam — the two-lane replacement for Bolt's JSH/OSC protocol.
 *
 * A Bolt.DIY facade (Delta 003 NexariRuntimeFacade) composes both lanes:
 * - The interactive REPL lane replaces `BoltShell`'s jsh --osc session
 *   (prompt display, command echo, Ctrl+C handling).
 * - The exec-capture lane replaces `BoltShell`'s OSC exit= parsing
 *   (action runner needs exit codes the REPL cannot surface).
 *
 * The facade must NOT emit or expect OSC 654. The no-OSC invariant is
 * falsifiable: every kernel-level contract test asserts the output stream
 * contains no `\x1b]654;` sequence.
 *
 * Evidence: scripts/check-bolt-terminal-contract.test.mjs (6 tests, green)
 */
export interface BoltTerminalSeam {
  /** Interactive REPL lane for terminal UI. */
  readonly repl: InteractiveReplLane;
  /** Exec exit-capture lane for action runner / git hooks. */
  readonly exec: ExecCaptureLane;
}

// ---------------------------------------------------------------------------
// Type-level exactness pin — machine-checked by tsc
// ---------------------------------------------------------------------------

// If InteractiveReplLane gains or loses a required member, these assignments
// fail at compile time. Excess properties on the right would also fail
// (TypeScript excess-property checking on object literals).

declare const _replExactness: InteractiveReplLane;
declare const _execExactness: ExecCaptureLane;
declare const _seamExactness: BoltTerminalSeam;

// Verify the seam composes exactly repl + exec, nothing else:
type _SeamKeys = keyof BoltTerminalSeam;
const _seamKeys: _SeamKeys[] = ['repl', 'exec'];
