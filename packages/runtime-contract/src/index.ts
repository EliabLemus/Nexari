import { unsupportedCapabilities, type RuntimeCapabilities } from './capabilities.js';
import { RuntimeError } from './errors.js';

export { unsupportedCapabilities, type CapabilityName, type CapabilityState, type RuntimeCapabilities } from './capabilities.js';
export { RuntimeError, type RuntimeErrorCode } from './errors.js';

export type RuntimeBackend = 'vivari' | 'stackblitz';
export type RuntimeState = 'created' | 'booting' | 'ready' | 'tearing_down' | 'terminated';

export interface RuntimeFileSystem {
  readFile(path: string, encoding?: 'utf8'): Promise<Uint8Array | string>;
  writeFile(path: string, contents: Uint8Array | string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  watch(path: string, listener?: (event: RuntimeFsChangeEvent) => void): RuntimeFsWatcher;
}

export interface RuntimeFsChangeEvent {
  kind: 'rename' | 'change';
  path: string;
}

/** A same-origin preview failure forwarded only when boot opts into it. */
export interface RuntimePreviewDiagnostic {
  kind: 'error' | 'unhandledrejection';
  message: string;
  filename?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface RuntimeFsWatcher extends AsyncIterable<RuntimeFsChangeEvent> {
  close(): void;
  readonly closed: boolean;
}

export interface RuntimeProcess {
  readonly pid: number;
  readonly output: ReadableStream<string>;
  readonly stdout: ReadableStream<string>;
  readonly stderr: ReadableStream<string>;
  readonly input: WritableStream<string>;
  readonly exit: Promise<number>;
  kill(): void;
  /**
   * Resize the attached terminal (initial dimensions come from
   * RuntimeSpawnOptions.terminal). The owned runtime refuses invalid dimensions
   * and dead pids, so a stale resize is inert. Demands a real-browser citation:
   * e2e/browser-smoke.e2e.mjs — wc006ResizeProof (guest SIGWINCH ack at
   * 100x30) must exist before hosts call this API.
   */
  resize(dimensions: RuntimeTerminalDimensions): void;
}

/** Initial or updated dimensions for an experimental interactive terminal.
 *
 * Refusal semantics (pinned by the adapter tests): the owned runtime rejects
 * invalid dimensions (non-positive or non-finite) inertly — a stale or invalid
 * resize posts no event and throws nothing, mirroring kernel.resize's boolean
 * refusal. Callers needing strict validation must check before calling.
 */
export interface RuntimeTerminalDimensions {
  columns: number;
  rows: number;
}

export interface RuntimeSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Attach an experimental interactive terminal with these initial dimensions;
   * the guest reads them on process.stdout.columns/rows. Demands a real-browser
   * citation: e2e/browser-smoke.e2e.mjs — wc006TtyDimsProof (guest probe
   * observes 80x24 at spawn) must exist before hosts pass this option.
   */
  terminal?: RuntimeTerminalDimensions; // browser proof: wc006TtyDimsProof (guest probe observes 80x24 at spawn)
}

export type RuntimeEventMap = {
  'server-ready': [port: number, url: string];
  'port': [port: number, kind: 'open' | 'close', url: string];
  'fs-change': [event: RuntimeFsChangeEvent];
  /** An unrecoverable runtime failure surfaced by the owned guest. */
  'error': [error: Error];
  /** Browser-preview error forwarded through the opt-in, origin-bound relay. */
  'preview-error': [diagnostic: RuntimePreviewDiagnostic];
};

/**
 * Public host boot options mirrored from the observed WebContainer call site.
 * They remain typed so unsupported requests can fail explicitly instead of
 * being silently dropped by a browser-runtime adapter.
 */
export interface RuntimeBootOptions {
  signal?: AbortSignal;
  /** Optional self-hosted origin that serves the runtime's preview routes. */
  previewOrigin?: string;
  coep?: 'credentialless';
  /** Optional safe namespace label accepted for WebContainer call compatibility. */
  workdirName?: string;
  /** Opt in to same-origin preview error and unhandled-rejection forwarding. */
  forwardPreviewErrors?: boolean;
}

export interface BrowserRuntime {
  readonly id: string;
  /** Stable absolute guest directory for host path translation and process cwd defaults. */
  readonly workdir: string;
  readonly state: RuntimeState;
  readonly fs: RuntimeFileSystem;
  boot(options?: RuntimeBootOptions): Promise<void>;
  mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void>;
  spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal; terminal?: RuntimeTerminalDimensions }): Promise<RuntimeProcess>;
  attachPreview(iframe: HTMLIFrameElement): () => void | PromiseLike<void>;
  on<E extends keyof RuntimeEventMap>(event: E, listener: (...args: RuntimeEventMap[E]) => void): () => void;
  export(path?: string): Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }>;
  teardown(): Promise<void>;
  getCapabilities(): RuntimeCapabilities;
}

export class RuntimeLifecycle {
  #state: RuntimeState = 'created';

  get state(): RuntimeState {
    return this.#state;
  }

  beginBoot(): void {
    this.#transition('created', 'booting');
  }

  markReady(): void {
    this.#transition('booting', 'ready');
  }

  beginTeardown(): void {
    if (this.#state === 'terminated') return;
    if (this.#state !== 'ready' && this.#state !== 'booting' && this.#state !== 'created') {
      throw new RuntimeError('TORN_DOWN', `Cannot tear down runtime from ${this.#state}`);
    }
    this.#state = 'tearing_down';
  }

  markTerminated(): void {
    if (this.#state === 'terminated') return;
    if (this.#state !== 'tearing_down') {
      throw new RuntimeError('TORN_DOWN', `Cannot terminate runtime from ${this.#state}`);
    }
    this.#state = 'terminated';
  }

  #transition(expected: RuntimeState, next: RuntimeState): void {
    if (this.#state === 'terminated') throw new RuntimeError('TORN_DOWN', 'Runtime has been torn down');
    if (this.#state !== expected) throw new RuntimeError('BOOT_FAILED', `Expected ${expected}; found ${this.#state}`);
    this.#state = next;
  }
}

export type RuntimeFactoryOptions =
  | { backend: 'stackblitz' }
  | {
    backend: 'vivari';
    id: string;
    isIsolated?: () => boolean;
    loadSdk?: () => Promise<unknown>;
  };

type VivariAdapterFactory = {
  createVivariRuntime(options: {
    id: string;
    isIsolated?: () => boolean;
    loadSdk: () => Promise<unknown>;
  }): BrowserRuntime;
  loadPinnedVivariSdk: () => Promise<unknown>;
};

/**
 * Selects a host-owned backend. StackBlitz remains deliberately unavailable;
 * Vivari is loaded through the adapter so this contract never imports its SDK.
 */
export async function createRuntime(options: RuntimeFactoryOptions): Promise<BrowserRuntime> {
  if (options.backend === 'stackblitz') {
    throw new RuntimeError('BACKEND_UNAVAILABLE', 'The StackBlitz backend is intentionally not bundled with Nexari.');
  }
  const adapterPath = '../../vivari-adapter/dist/index.js';
  const adapter = await import(adapterPath) as VivariAdapterFactory;
  return adapter.createVivariRuntime({
    id: options.id,
    isIsolated: options.isIsolated,
    loadSdk: options.loadSdk ?? adapter.loadPinnedVivariSdk,
  });
}

export function declaredCapabilities(): RuntimeCapabilities {
  return unsupportedCapabilities();
}
