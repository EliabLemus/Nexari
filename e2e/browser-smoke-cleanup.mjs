import { once } from 'node:events';

/** Stop only a child process created by the browser lab, and wait for it to exit. */
export async function terminateChild(child, { graceMs = 5_000 } = {}) {
  if (child.exitCode != null || child.signalCode != null) return;

  const exited = once(child, 'exit');
  if (!child.kill('SIGTERM')) return;
  const exitedInGrace = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), graceMs)),
  ]);
  if (exitedInGrace) return;

  if (!child.kill('SIGKILL')) return;
  await exited;
}
