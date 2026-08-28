export type RuntimeErrorCode =
  | 'ISOLATION_REQUIRED'
  | 'BACKEND_UNAVAILABLE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'BOOT_FAILED'
  | 'BOOT_ABORTED'
  | 'TORN_DOWN'
  | 'COMMAND_NOT_FOUND';

export class RuntimeError extends Error {
  readonly name = 'RuntimeError';

  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
