declare module '@vivari/core' {
  export const Vivari: {
    boot(options?: { signal?: AbortSignal }): Promise<import('./index.js').VivariLike>;
  };
}
