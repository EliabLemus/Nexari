import {
  RuntimeError,
  RuntimeLifecycle,
  unsupportedCapabilities,
  type BrowserRuntime,
  type RuntimeCapabilities,
  type RuntimeBootOptions,
  type RuntimeFileSystem,
  type RuntimeFsChangeEvent,
  type RuntimeFsWatcher,
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
    watch(path: string, listener?: (event: RuntimeFsChangeEvent) => void): RuntimeFsWatcher;
  };
  mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void>;
  spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal }): Promise<RuntimeProcess>;
  attachPreview(iframe: HTMLIFrameElement): () => void | PromiseLike<void>;
  on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
  on(event: 'port', listener: (port: number, kind: 'open' | 'close', url: string) => void): () => void;
  on(event: 'fs-change', listener: (event: RuntimeFsChangeEvent) => void): () => void;
  on(event: 'error', listener: (error: Error) => void): () => void;
  export(path?: string): Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }>;
  teardown(): void | Promise<void>;
}

export interface VivariSdk {
  boot(options?: { signal?: AbortSignal; previewOrigin?: string }): Promise<VivariLike>;
}

export interface VivariAdapterOptions {
  id: string;
  isIsolated?: () => boolean;
  loadSdk: () => Promise<VivariSdk>;
}

// One host preview element can be reused by a fresh runtime after an older
// runtime's cleanup fails. Generations therefore belong to the element, not a
// single adapter instance, so a stale cleanup retry cannot clear the new view.
const previewGenerations = new WeakMap<HTMLIFrameElement, number>();

export function createVivariRuntime(options: VivariAdapterOptions): BrowserRuntime {
  return new NexariVivariRuntime(options);
}

/** The sole fork-specific import seam; host applications only call the adapter API. */
export async function loadPinnedVivariSdk(): Promise<VivariSdk> {
  const { Vivari } = await import('../../../runtime/vivari/packages/core/dist/index.js');
  return { boot: (options) => Vivari.boot(options) };
}

/**
 * Clear the pinned fork's origin-scoped VFS only when a host explicitly asks for
 * a clean-room runtime instance. Normal adapter boots retain the fork's durable
 * project storage.
 */
export async function resetPinnedVivariVfs(): Promise<boolean> {
  const { resetVfs } = await import('../../../runtime/vivari/packages/core/dist/index.js');
  return resetVfs();
}

class NexariVivariRuntime implements BrowserRuntime {
  readonly id: string;
  readonly workdir = '/';
  readonly fs: RuntimeFileSystem;
  #lifecycle = new RuntimeLifecycle();
  #instance: VivariLike | undefined;
  #processes = new Set<RuntimeProcess>();
  #detachPreview = new Set<() => void | PromiseLike<void>>();
  #detachEvents = new Set<() => void>();
  #mountAbortControllers = new Set<AbortController>();
  #spawnAbortControllers = new Set<AbortController>();
  #mountPromises = new Set<Promise<void>>();
  #spawnPromises = new Set<Promise<RuntimeProcess>>();
  #readFilePromises = new Set<Promise<unknown>>();
  #readdirPromises = new Set<Promise<string[]>>();
  #writeFilePromises = new Set<Promise<void>>();
  #mkdirPromises = new Set<Promise<void>>();
  #rmPromises = new Set<Promise<void>>();
  #watchers = new Set<RuntimeFsWatcher>();
  #exportPromises = new Set<Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }>>();
  #bootPromise: Promise<void> | undefined;
  #bootPreviewOrigin: string | undefined;
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
        const readPromise = encoding
          ? this.#ready().fs.readFile(path, encoding)
          : this.#ready().fs.readFile(path);
        this.#readFilePromises.add(readPromise);
        try {
          const contents = await readPromise;
          if (this.state !== 'ready') {
            throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while reading a file');
          }
          return contents;
        } finally {
          this.#readFilePromises.delete(readPromise);
        }
      },
      writeFile: async (path, contents) => {
        const writePromise = this.#ready().fs.writeFile(path, contents);
        this.#writeFilePromises.add(writePromise);
        try {
          await writePromise;
          if (this.state !== 'ready') {
            throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while writing a file');
          }
        } finally {
          this.#writeFilePromises.delete(writePromise);
        }
      },
      readdir: async (path) => {
        const readdirPromise = this.#ready().fs.readdir(path);
        this.#readdirPromises.add(readdirPromise);
        try {
          const entries = await readdirPromise;
          if (this.state !== 'ready') {
            throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while listing a directory');
          }
          return entries;
        } finally {
          this.#readdirPromises.delete(readdirPromise);
        }
      },
      mkdir: async (path, options) => {
        const mkdirPromise = this.#ready().fs.mkdir(path, options);
        this.#mkdirPromises.add(mkdirPromise);
        try {
          await mkdirPromise;
          if (this.state !== 'ready') {
            throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while creating a directory');
          }
        } finally {
          this.#mkdirPromises.delete(mkdirPromise);
        }
      },
      rm: async (path, options) => {
        const rmPromise = this.#ready().fs.rm(path, options);
        this.#rmPromises.add(rmPromise);
        try {
          await rmPromise;
          if (this.state !== 'ready') {
            throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while removing a path');
          }
        } finally {
          this.#rmPromises.delete(rmPromise);
        }
      },
      watch: (path, listener) => {
        let active = true;
        const watcher = this.#ready().fs.watch(path, (event) => {
          if (active && this.state === 'ready') listener?.(event);
        });
        const runtime = this;
        const ownedWatcher: RuntimeFsWatcher = {
          get closed() { return watcher.closed; },
          close: () => {
            // A guest close may synchronously emit (or throw). Stop forwarding
            // before entering guest code so no stale callback reaches the host.
            active = false;
            watcher.close();
            this.#watchers.delete(ownedWatcher);
          },
          [Symbol.asyncIterator]: async function* () {
            const iterator = watcher[Symbol.asyncIterator]();
            while (active && runtime.state === 'ready') {
              let next: IteratorResult<RuntimeFsChangeEvent>;
              try {
                next = await iterator.next();
              } catch (cause) {
                if (!active || runtime.state !== 'ready') return;
                throw cause;
              }
              if (!active || runtime.state !== 'ready' || next.done) return;
              yield next.value;
            }
          },
        };
        this.#watchers.add(ownedWatcher);
        return ownedWatcher;
      },
    };
  }

  get state() { return this.#lifecycle.state; }

  boot(options?: RuntimeBootOptions): Promise<void> {
    if (this.#isTornDown()) return Promise.reject(new RuntimeError('TORN_DOWN', 'Runtime has been torn down'));
    if (isInvalidPreviewOrigin(options?.previewOrigin)) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', 'Preview origin must be an absolute URL.'));
    }
    if (isNonHttpPreviewOrigin(options?.previewOrigin)) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', 'Preview origin must be an absolute HTTP(S) URL.'));
    }
    if (hasPreviewOriginCredentials(options?.previewOrigin)) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', 'Preview origin must not contain credentials.'));
    }
    if (hasPreviewOriginPathQueryOrFragment(options?.previewOrigin)) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', 'Preview origin must not include a path, query, or fragment.'));
    }
    if (isStackBlitzPreviewOrigin(options?.previewOrigin)) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', 'StackBlitz preview origins are intentionally unavailable in Nexari.'));
    }
    const unsupportedOption = unsupportedBootOption(options);
    if (unsupportedOption) {
      return Promise.reject(new RuntimeError('UNSUPPORTED_CAPABILITY', `Unsupported boot option: ${unsupportedOption}`));
    }
    const previewOrigin = normalizePreviewOrigin(options?.previewOrigin);
    if (this.#bootPromise) {
      if (previewOrigin !== this.#bootPreviewOrigin) {
        return Promise.reject(new RuntimeError('BOOT_FAILED', 'Runtime boot options cannot change while boot is in progress.'));
      }
      return this.#bootPromise;
    }
    this.#bootPreviewOrigin = previewOrigin;
    this.#bootPromise = this.#boot({ ...options, ...(previewOrigin === undefined ? {} : { previewOrigin }) });
    return this.#bootPromise;
  }

  async #boot(options?: RuntimeBootOptions): Promise<void> {
    const { signal, previewOrigin } = options ?? {};
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
      this.#guestBootPromise = sdk.boot({ signal: abortController.signal, ...(previewOrigin === undefined ? {} : { previewOrigin }) });
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
      throw new RuntimeError('BOOT_FAILED', cause instanceof Error ? cause.message : 'Vivari boot failed', cause);
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      if (this.#bootAbortController === abortController) this.#bootAbortController = undefined;
    }
  }

  async mount(tree: unknown, options?: { mountPoint?: string; signal?: AbortSignal }): Promise<void> {
    const instance = this.#ready();
    if (options?.mountPoint !== undefined && !options.mountPoint.startsWith('/')) {
      throw new TypeError('mountPoint must be an absolute path');
    }
    if (options?.signal?.aborted) throw options.signal.reason;
    const controller = new AbortController();
    const abortForCaller = () => controller.abort(options?.signal?.reason);
    options?.signal?.addEventListener('abort', abortForCaller, { once: true });
    this.#mountAbortControllers.add(controller);
    const mountPromise = instance.mount(tree, { ...options, signal: controller.signal });
    this.#mountPromises.add(mountPromise);
    try {
      await mountPromise;
      if (this.state !== 'ready') {
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while a mount was in flight');
      }
      if (controller.signal.aborted) throw controller.signal.reason;
    } catch (cause) {
      if (this.state !== 'ready') {
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while a mount was in flight', cause);
      }
      throw cause;
    } finally {
      options?.signal?.removeEventListener('abort', abortForCaller);
      this.#mountAbortControllers.delete(controller);
      this.#mountPromises.delete(mountPromise);
    }
  }

  async spawn(command: string, args: string[] = [], options?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal }): Promise<RuntimeProcess> {
    try {
      const instance = this.#ready();
      if (options?.signal?.aborted) throw options.signal.reason;
      const controller = new AbortController();
      const abortForCaller = () => controller.abort(options?.signal?.reason);
      options?.signal?.addEventListener('abort', abortForCaller, { once: true });
      this.#spawnAbortControllers.add(controller);
      const spawnPromise = instance.spawn(command, args, { ...options, signal: controller.signal });
      this.#spawnPromises.add(spawnPromise);
      let process: RuntimeProcess;
      try {
        process = await spawnPromise;
      } finally {
        options?.signal?.removeEventListener('abort', abortForCaller);
        this.#spawnAbortControllers.delete(controller);
        this.#spawnPromises.delete(spawnPromise);
      }
      if (this.state !== 'ready' || controller.signal.aborted) {
        try {
          process.kill();
        } catch {
          // A late process cannot be exposed after teardown or caller cancellation.
        }
        if (this.state !== 'ready') {
          throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while a process was starting');
        }
        throw controller.signal.reason;
      }
      let killed = false;
      const trackedProcess: RuntimeProcess = {
        pid: process.pid,
        output: process.output,
        stdout: process.stdout,
        stderr: process.stderr,
        input: process.input,
        exit: process.exit,
        kill: () => {
          if (killed) return;
          process.kill();
          killed = true;
        },
      };
      this.#processes.add(trackedProcess);
      void trackedProcess.exit.then(
        () => { this.#processes.delete(trackedProcess); },
        () => { this.#processes.delete(trackedProcess); },
      );
      return trackedProcess;
    } catch (cause) {
      if (isVivariCommandNotFound(cause)) throw new RuntimeError('COMMAND_NOT_FOUND', cause.message, cause);
      throw cause;
    }
  }

  attachPreview(iframe: HTMLIFrameElement): () => void | PromiseLike<void> {
    const detach = this.#ready().attachPreview(iframe);
    const generation = (previewGenerations.get(iframe) ?? 0) + 1;
    previewGenerations.set(iframe, generation);
    let active = true;
    let pendingDetach: Promise<void> | undefined;
    const ownedDetach = (): void | PromiseLike<void> => {
      if (!active) return;
      if (pendingDetach) return pendingDetach;
      if (previewGenerations.get(iframe) === generation) {
        // Detaching the relay alone leaves the old document alive in the iframe.
        // Clear it before cleanup so a stale preview cannot outlive this runtime.
        iframe.removeAttribute?.('src');
        iframe.hidden = true;
      }
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
    const instance = this.#ready();
    let active = true;
    let detach: () => void;
    if (event === 'server-ready') {
      const forwardIfReady = (port: number, url: string) => {
        if (active && this.state === 'ready') (listener as (port: number, url: string) => void)(port, url);
      };
      detach = instance.on('server-ready', forwardIfReady);
    } else if (event === 'port') {
      const forwardIfReady = (port: number, kind: 'open' | 'close', url: string) => {
        if (active && (this.state === 'ready' || (this.state === 'tearing_down' && kind === 'close'))) {
          (listener as unknown as (port: number, kind: 'open' | 'close', url: string) => void)(port, kind, url);
        }
      };
      detach = instance.on('port', forwardIfReady);
    } else if (event === 'fs-change') {
      const forwardIfReady = (change: RuntimeFsChangeEvent) => {
        if (active && this.state === 'ready') (listener as (event: RuntimeFsChangeEvent) => void)(change);
      };
      detach = instance.on('fs-change', forwardIfReady);
    } else if (event === 'error') {
      const forwardIfReady = (error: Error) => {
        if (active && this.state === 'ready') (listener as (error: Error) => void)(error);
      };
      detach = instance.on('error', forwardIfReady);
    } else {
      throw new RuntimeError('UNSUPPORTED_CAPABILITY', `Unsupported event ${String(event)}`);
    }
    const ownedDetach = () => {
      if (!active) return;
      active = false;
      try {
        // A guest unsubscription may synchronously emit. Gate first so it
        // cannot deliver an event after the host has detached its listener.
        detach();
        this.#detachEvents.delete(ownedDetach);
      } catch (error) {
        // Keep failed cleanup retryable, but do not expose an event emitted
        // synchronously by the failing guest detach.
        active = true;
        throw error;
      }
    };
    this.#detachEvents.add(ownedDetach);
    return ownedDetach;
  }

  async export(path?: string): Promise<{ files: Array<{ path: string; contents: Uint8Array }>; truncated: boolean }> {
    const exportPromise = this.#ready().export(path);
    this.#exportPromises.add(exportPromise);
    try {
      const snapshot = await exportPromise;
      if (this.state !== 'ready') {
        throw new RuntimeError('TORN_DOWN', 'Runtime was torn down while exporting a filesystem snapshot');
      }
      return snapshot;
    } finally {
      this.#exportPromises.delete(exportPromise);
    }
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
    for (const controller of this.#mountAbortControllers) controller.abort();
    for (const controller of this.#spawnAbortControllers) controller.abort();
    if (this.#mountPromises.size > 0) await Promise.allSettled([...this.#mountPromises]);
    if (this.#spawnPromises.size > 0) await Promise.allSettled([...this.#spawnPromises]);
    if (this.#readFilePromises.size > 0) await Promise.allSettled([...this.#readFilePromises]);
    if (this.#readdirPromises.size > 0) await Promise.allSettled([...this.#readdirPromises]);
    if (this.#writeFilePromises.size > 0) await Promise.allSettled([...this.#writeFilePromises]);
    if (this.#mkdirPromises.size > 0) await Promise.allSettled([...this.#mkdirPromises]);
    if (this.#rmPromises.size > 0) await Promise.allSettled([...this.#rmPromises]);
    if (this.#exportPromises.size > 0) await Promise.allSettled([...this.#exportPromises]);
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
    for (const process of [...this.#processes]) {
      try {
        process.kill();
        this.#processes.delete(process);
      } catch (error) {
        failure ??= error;
      }
    }
    for (const detach of [...this.#detachPreview]) await cleanUp(detach);
    for (const watcher of [...this.#watchers]) await cleanUp(() => watcher.close());
    const instance = this.#instance;
    if (instance) {
      try {
        await instance.teardown();
        this.#instance = undefined;
      } catch (error) {
        failure ??= error;
      }
    }
    // Keep port subscriptions through guest teardown so its terminal close
    // events can reach the host, then detach every listener before termination.
    for (const detach of [...this.#detachEvents]) await cleanUp(detach);
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

function isStackBlitzPreviewOrigin(previewOrigin: string | undefined): boolean {
  if (!previewOrigin) return false;
  try {
    const hostname = new URL(previewOrigin).hostname.toLowerCase().replace(/\.+$/, '');
    return hostname === 'stackblitz.io' || hostname.endsWith('.stackblitz.io');
  } catch {
    return false;
  }
}

function isInvalidPreviewOrigin(previewOrigin: string | undefined): boolean {
  if (previewOrigin === undefined) return false;
  // JavaScript callers can bypass the TypeScript contract. Do not coerce an
  // object through URL() and accidentally forward it into the owned SDK.
  if (typeof previewOrigin !== 'string') return true;
  try {
    new URL(previewOrigin);
    return false;
  } catch {
    return true;
  }
}

function normalizePreviewOrigin(previewOrigin: string | undefined): string | undefined {
  return previewOrigin === undefined ? undefined : new URL(previewOrigin).origin;
}

function isNonHttpPreviewOrigin(previewOrigin: string | undefined): boolean {
  if (!previewOrigin) return false;
  const { protocol } = new URL(previewOrigin);
  return protocol !== 'http:' && protocol !== 'https:';
}

function hasPreviewOriginCredentials(previewOrigin: string | undefined): boolean {
  if (!previewOrigin) return false;
  const { username, password } = new URL(previewOrigin);
  return username.length > 0 || password.length > 0;
}

function hasPreviewOriginPathQueryOrFragment(previewOrigin: string | undefined): boolean {
  if (!previewOrigin) return false;
  const { pathname, search, hash } = new URL(previewOrigin);
  return pathname !== '/' || search.length > 0 || hash.length > 0;
}

function unsupportedBootOption(options?: RuntimeBootOptions): 'coep' | 'workdirName' | 'forwardPreviewErrors' | undefined {
  if (!options) return undefined;
  // The host's `credentialless` request is satisfied by the outer document's
  // isolation headers; Vivari must not receive a WebContainer-specific option.
  // Keep every other value fail-closed for untyped JavaScript callers.
  if (options.coep !== undefined && options.coep !== 'credentialless') return 'coep';
  for (const option of ['workdirName', 'forwardPreviewErrors'] as const) {
    if (Object.hasOwn(options, option)) return option;
  }
  return undefined;
}
