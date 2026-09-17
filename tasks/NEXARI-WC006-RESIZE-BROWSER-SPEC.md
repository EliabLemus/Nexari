# NEXARI-WC006-RESIZE-BROWSER-SPEC — final leg of BOLT-WC-006

Frozen before implementation. Driver: OpenAI Codex gpt-5.6-sol. Challenger: Z.AI GLM-5.3
(pre-mortem 2026-09-16, verdict REVISE_CONTRACT — 3 findings, all accepted). Judge: deterministic.

## Objective

Prove terminal cols/rows + live resize against the owned Vivari runtime in a real browser,
completing the last unproven legs of BOLT-WC-006 (input, merged output, kill already proven).

## Non-goals

Runtime transplant, adoption of @vivari/core@1.0.0, fresh architecture, almostnode/Nodepod,
restricted code, Bolt integration, deployment, push/tag/release.

## Accepted Challenger findings (contract revisions)

1. HIGH (AC-5): capability label decided pre-implementation — `interactive_terminal`
   flips `unsupported` → `experimental` in the SAME change; both pinned assertions and the
   matrix row narrow together. Keeping `unsupported` would contradict the proven state.
2. MEDIUM (AC-5): resize leg ordering — dedicated probe process; initial dims asserted
   BEFORE the resize (guest alive); resize never after the kill leg; bounded waits with
   diagnostic errors; guest prints post-SIGWINCH ack lines.
3. MEDIUM (AUDIT): red-first — the extended audit/pins land and are observed failing
   BEFORE implementation; syscall pin (SIGWINCH/TIOCSWINSZ) stays untouched (kernel control
   path bypasses syscall names, still true).

## Acceptance criteria (Judge gates, frozen)

- AC-A: Focused tests: check-compatibility-evidence, runtime-contract, vivari-adapter,
  check-runtime-shell-coreutils (node kernel lab) — all green after implementation.
- AC-B: `npm run build` clean (includes fork build/verify/smoke via build:vivari).
- AC-C: `npm run test:browser-lab` green: fresh temp Chrome user-data-dir, CDP bound to
  127.0.0.1 only via NEXARI_CHROME_CDP_URL, created Chrome terminated, temp profile removed.
- AC-D: Browser evidence: guest `node` probe spawned with `terminal {columns:80, rows:24}`;
  merged output contains initial `process.stdout.columns/rows` = 80/24 (`wc006TtyDimsProof`);
  host calls `resize({columns:100, rows:30})`; guest `process.on('SIGWINCH')` ack observes
  100/30 (`wc006ResizeProof`); waits bounded with diagnostics.
- AC-E: `git diff --check` clean; scope/status checks green; no prohibited side effects;
  `main` (parent 1de7a8e, submodule 26f1d62) unchanged.

## Seams (minimal, in dependency order)

1. Audit red: matrix WC-006 row demanded as proven citing wc006TtyDimsProof + wc006ResizeProof;
   contract/core pins flipped from forbid to require-with-proof; capability pin experimental.
2. Core (submodule): SpawnOptions `terminal?: {columns, rows}`; proc-spawn carries terminal;
   `VivariProcess.resize` posts `proc-resize`; kernel-worker routes resize → kernel.resize
   and forwards dims → kernel.launch opts (kernel already validates dims/dead pids).
3. Contract: RuntimeTerminalDimensions, RuntimeSpawnOptions.terminal, RuntimeProcess.resize;
   capabilities `interactive_terminal: 'experimental'`.
4. Adapter: options.terminal → core spawn; trackedProcess.resize → core resize, typed
   RuntimeError('UNSUPPORTED_CAPABILITY') when an older pinned core lacks the method.
5. Lab + e2e: probe legs + dataset assertions; capabilities string + dedicated assertion flip.
6. Matrix row → proven (all five legs cited).

## Evidence log

- 2026-09-16 pre-mortem: REVISE_CONTRACT (findings above, transcript
  ~/.hermes/cache/delegation/live/deleg_ffb9b43c/task-0.log).
