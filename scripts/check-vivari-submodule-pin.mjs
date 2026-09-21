import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PINNED_VIVARI_SHA = '210d50d3f314b1fc6b148776ee24c2d48d8d022d';

export function validatePinnedVivariSubmodule({ gitlink, submoduleHead }) {
  const expectedGitlink = `160000 commit ${PINNED_VIVARI_SHA}\truntime/vivari`;
  if (gitlink.trim() !== expectedGitlink) {
    throw new Error(`runtime/vivari gitlink must remain ${PINNED_VIVARI_SHA}`);
  }
  if (submoduleHead.trim() !== PINNED_VIVARI_SHA) {
    throw new Error(`checked-out runtime/vivari HEAD must remain ${PINNED_VIVARI_SHA}`);
  }
}

async function git(...args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [gitlink, submoduleHead] = await Promise.all([
    git('ls-tree', 'HEAD', 'runtime/vivari'),
    git('-C', 'runtime/vivari', 'rev-parse', 'HEAD'),
  ]);
  validatePinnedVivariSubmodule({ gitlink, submoduleHead });
  console.log(`Vivari submodule pin OK (${PINNED_VIVARI_SHA}; gitlink and checkout agree)`);
}
