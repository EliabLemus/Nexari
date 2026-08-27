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
}

export interface RuntimeProcess {
  readonly pid: number;
  readonly output: ReadableStream<string>;
  readonly stdout: ReadableStream<string>;
  readonly stderr: ReadableStream<string>;
  readonly input: WritableStream<string>;
  readonly exit: Promise<number>;
  kill(): void;
}

export interface BrowserRuntime {
  readonly id: string;
  readonly state: RuntimeState;
  readonly fs: RuntimeFileSystem;
  boot(options?: { signal?: AbortSignal }): Promise<void>;
  mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void>;
  spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal }): Promise<RuntimeProcess>;
  attachPreview(iframe: HTMLIFrameElement): () => void;
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

export async function createRuntime(options: { backend: RuntimeBackend }): Promise<BrowserRuntime> {
  if (options.backend === 'stackblitz') {
    throw new RuntimeError('BACKEND_UNAVAILABLE', 'The StackBlitz backend is intentionally not bundled with Nexari.');
  }
  throw new RuntimeError('BACKEND_UNAVAILABLE', 'The Nexari Vivari adapter has not been linked in this milestone.');
}

export function declaredCapabilities(): RuntimeCapabilities {
  return unsupportedCapabilities();
}
