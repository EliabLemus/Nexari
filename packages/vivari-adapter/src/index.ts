import {
  RuntimeError,
  RuntimeLifecycle,
  unsupportedCapabilities,
  type BrowserRuntime,
  type RuntimeCapabilities,
  type RuntimeFileSystem,
  type RuntimeProcess,
  type RuntimeEventMap,
} from '../../runtime-contract/dist/index.js';

export interface VivariLike {
  /** Narrow view of the owned fork API; the host contract is adapted below. */
  fs: {
    readFile(path: string): Promise<Uint8Array>;
    readFile(path: string, encoding: 'utf8' | 'utf-8'): Promise<string>;
    writeFile(path: string, contents: Uint8Array | string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  };
  mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void>;
  spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal }): Promise<RuntimeProcess>;
  attachPreview(iframe: HTMLIFrameElement): () => void | PromiseLike<void>;
  on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
  export(path?: string): Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }>;
  teardown(): void | Promise<void>;
}

export interface VivariSdk {
  boot(options?: { signal?: AbortSignal }): Promise<VivariLike>;
}

export interface VivariAdapterOptions {
  id: string;
  isIsolated?: () => boolean;
  loadSdk: () => Promise<VivariSdk>;
}

export function createVivariRuntime(options: VivariAdapterOptions): BrowserRuntime {
  return new NexariVivariRuntime(options);
}

/** The sole fork-specific import seam; host applications only call the adapter API. */
export async function loadPinnedVivariSdk(): Promise<VivariSdk> {
  const { Vivari } = await import('@vivari/core');
  return { boot: (options) => Vivari.boot(options) };
}

class NexariVivariRuntime implements BrowserRuntime {
  readonly id: string;
  readonly fs: RuntimeFileSystem;
  #lifecycle = new RuntimeLifecycle();
  #instance: VivariLike | undefined;
  #detachPreview = new Set<() => void | PromiseLike<void>>();
  #detachEvents = new Set<() => void>();
  #bootPromise: Promise<void> | undefined;
  #guestBootPromise: Promise<VivariLike> | undefined;
  #guestBootInFlight = false;
  #bootAbortController: AbortController | undefined;
  #teardownPromise: Promise<void> | undefined;
  #teardownFailed = false;
  #isIsolated: () => boolean;
  #loadSdk: () => Promise<VivariSdk>;

  constructor({ id, isIsolated = defaultIsolation, loadSdk }: VivariAdapterOptions) {
    this.id = id;
    this.#isIsolated = isIsolated;
    this.#loadSdk = loadSdk;
    this.fs = {
      readFile: async (path, encoding) => {
        const contents = await (encoding
          ? this.#ready().fs.readFile(path, encoding)
          : this.#ready().fs.readFile(path));
        if (this.state !== 'ready') {
          throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while reading a file');
        }
        return contents;
      },
      writeFile: async (path, contents) => {
        await this.#ready().fs.writeFile(path, contents);
        if (this.state !== 'ready') {
          throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while writing a file');
        }
      },
      readdir: (path) => this.#ready().fs.readdir(path),
      mkdir: (path, options) => this.#ready().fs.mkdir(path, options),
      rm: (path, options) => this.#ready().fs.rm(path, options),
    };
  }

  get state() { return this.#lifecycle.state; }

  boot({ signal }: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.#isTornDown()) return Promise.reject(new RuntimeError('TORN_DOWN', 'Runtime has been torn down'));
    if (!this.#bootPromise) this.#bootPromise = this.#boot(signal);
    return this.#bootPromise;
  }

  async #boot(signal?: AbortSignal): Promise<void> {
    if (this.#isTornDown()) {
      throw new RuntimeError('TORN_DOWN', 'Runtime has been torn down');
    }
    if (signal?.aborted) {
      this.#lifecycle.beginBoot();
      this.#lifecycle.beginTeardown();
      this.#lifecycle.markTerminated();
      throw new RuntimeError('BOOT_ABORTED', 'Runtime boot was cancelled before the Vivari SDK loaded');
    }
    if (!this.#isIsolated()) throw new RuntimeError('ISOLATION_REQUIRED', 'Nexari requires cross-origin isolation and SharedArrayBuffer.');
    this.#lifecycle.beginBoot();
    const abortController = new AbortController();
    this.#bootAbortController = abortController;
    const forwardAbort = () => abortController.abort(signal?.reason);
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const sdk = await this.#loadSdk();
      if (this.state !== 'booting') throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while Vivari SDK was loading');
      if (abortController.signal.aborted) {
        this.#lifecycle.beginTeardown();
        this.#lifecycle.markTerminated();
        throw new RuntimeError('BOOT_ABORTED', 'Runtime boot was cancelled while the Vivari SDK was loading');
      }
      this.#guestBootPromise = sdk.boot({ signal: abortController.signal });
      this.#guestBootInFlight = true;
      let instance: VivariLike;
      try {
        instance = await this.#guestBootPromise;
      } finally {
        this.#guestBootInFlight = false;
      }
      if (this.state !== 'booting') {
        if (this.state === 'tearing_down') {
          // The active teardown owns the late guest, including failure reporting and retries.
          this.#instance = instance;
          throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while Vivari was booting');
        }
        try {
          await instance.teardown();
        } catch (cleanupFailure) {
          this.#instance = instance;
          this.#teardownFailed = true;
          throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while Vivari was booting', cleanupFailure);
        }
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while Vivari was booting');
      }
      if (abortController.signal.aborted) {
        let cleanupFailure: unknown;
        try {
          await instance.teardown();
        } catch (error) {
          cleanupFailure = error;
        } finally {
          this.#lifecycle.beginTeardown();
          this.#lifecycle.markTerminated();
        }
        if (cleanupFailure) {
          this.#instance = instance;
          this.#teardownFailed = true;
        }
        throw new RuntimeError('BOOT_ABORTED', 'Runtime boot was cancelled while Vivari was booting', cleanupFailure);
      }
      this.#instance = instance;
      this.#lifecycle.markReady();
    } catch (cause) {
      if (this.#isTornDown()) {
        if (cause instanceof RuntimeError && (cause.code === 'TORN_DOWN' || cause.code === 'BOOT_ABORTED')) throw cause;
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while Vivari was booting');
      }
      if (abortController.signal.aborted && this.state === 'booting') {
        this.#lifecycle.beginTeardown();
        this.#lifecycle.markTerminated();
        throw new RuntimeError('BOOT_ABORTED', 'Runtime boot was cancelled while the Vivari SDK was loading', cause);
      }
      if (this.state === 'booting') {
        this.#lifecycle.beginTeardown();
        this.#lifecycle.markTerminated();
      }
      if (cause instanceof RuntimeError) throw cause;
      throw new RuntimeError('BOOT_FAILED', cause instanceof Error ? cause.message : 'Vivari boot failed');
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      if (this.#bootAbortController === abortController) this.#bootAbortController = undefined;
    }
  }

  async mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void> {
    await this.#ready().mount(tree, options);
    if (this.state !== 'ready') {
      throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while a mount was in flight');
    }
  }

  async spawn(command: string, args: string[] = [], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal }): Promise<RuntimeProcess> {
    try {
      const process = await this.#ready().spawn(command, args, options);
      if (this.state !== 'ready') {
        try {
          process.kill();
        } catch {
          // A late process cannot be exposed after teardown, even if guest cleanup rejects.
        }
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while a process was starting');
      }
      return process;
    } catch (cause) {
      if (isVivariCommandNotFound(cause)) throw new RuntimeError('COMMAND_NOT_FOUND', cause.message, cause);
      throw cause;
    }
  }

  attachPreview(iframe: HTMLIFrameElement): () => void | PromiseLike<void> {
    const detach = this.#ready().attachPreview(iframe);
    let active = true;
    let pendingDetach: Promise<void> | undefined;
    const ownedDetach = (): void | PromiseLike<void> => {
      if (!active) return;
      if (pendingDetach) return pendingDetach;
      const result = detach();
      if (result && typeof (result as PromiseLike<void>).then === 'function') {
        pendingDetach = Promise.resolve(result).then(
          () => {
            active = false;
            this.#detachPreview.delete(ownedDetach);
          },
          (error) => {
            pendingDetach = undefined;
            throw error;
          },
        );
        return pendingDetach;
      }
      active = false;
      this.#detachPreview.delete(ownedDetach);
    };
    this.#detachPreview.add(ownedDetach);
    return ownedDetach;
  }

  on<E extends keyof RuntimeEventMap>(event: E, listener: (...args: RuntimeEventMap[E]) => void): () => void {
    if (event !== 'server-ready') throw new RuntimeError('UNSUPPORTED_CAPABILITY', `Unsupported event ${String(event)}`);
    const forwardIfReady = (port: number, url: string) => {
      if (this.state === 'ready') (listener as (port: number, url: string) => void)(port, url);
    };
    const detach = this.#ready().on('server-ready', forwardIfReady);
    let active = true;
    const ownedDetach = () => {
      if (!active) return;
      detach();
      active = false;
      this.#detachEvents.delete(ownedDetach);
    };
    this.#detachEvents.add(ownedDetach);
    return ownedDetach;
  }

  async export(path?: string): Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }> {
    const snapshot = await this.#ready().export(path);
    if (this.state !== 'ready') {
      throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while exporting a filesystem snapshot');
    }
    return snapshot;
  }

  async teardown(): Promise<void> {
    if (this.#teardownPromise) return this.#teardownPromise;
    if (this.state === 'terminated' && !this.#teardownFailed) return;
    this.#teardownFailed = false;
    this.#teardownPromise = this.#teardown();
    try {
      await this.#teardownPromise;
    } catch (error) {
      this.#teardownPromise = undefined;
      this.#teardownFailed = true;
      throw error;
    }
  }

  async #teardown(): Promise<void> {
    this.#lifecycle.beginTeardown();
    this.#bootAbortController?.abort();
    if (this.#guestBootInFlight) await this.#bootPromise?.catch(() => undefined);
    let failure: unknown;
    const cleanUp = (operation: () => void | PromiseLike<void>) => {
      try {
        const result = operation();
        if (result instanceof Promise) return result.catch((error) => { failure ??= error; });
      } catch (error) {
        failure ??= error;
      }
    };
    for (const detach of [...this.#detachPreview]) await cleanUp(detach);
    for (const detach of [...this.#detachEvents]) await cleanUp(detach);
    const instance = this.#instance;
    if (instance) {
      try {
        await instance.teardown();
        this.#instance = undefined;
      } catch (error) {
        failure ??= error;
      }
    }
    this.#lifecycle.markTerminated();
    if (failure) throw failure;
  }

  getCapabilities(): RuntimeCapabilities { return unsupportedCapabilities(); }

  #isTornDown(): boolean {
    return this.state === 'terminated' || this.state === 'tearing_down';
  }

  #ready(): VivariLike {
    if (this.state === 'terminated' || this.state === 'tearing_down') throw new RuntimeError('TORN_DOWN', 'Runtime has been torn down');
    if (!this.#instance || this.state !== 'ready') throw new RuntimeError('BOOT_FAILED', 'Runtime is not ready');
    return this.#instance;
  }
}

function defaultIsolation(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
}

function isVivariCommandNotFound(cause: unknown): cause is Error & { code: 'ERR_COMMAND_NOT_FOUND' } {
  return cause instanceof Error && (cause as { code?: unknown }).code === 'ERR_COMMAND_NOT_FOUND';
}
