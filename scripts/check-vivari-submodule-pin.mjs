import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PINNED_VIVARI_SHA = '210d50d3f314b1fc6b148776ee24c2d48d8d022d';
export const VIVARI_MIRROR_URL = 'https://github.com/EliabLemus/nexari-vivari-provenance-20260922.git';

export function validatePinnedVivariSubmodule({ gitlink, submoduleHead }) {
  const expectedGitlink = `160000 commit ${PINNED_VIVARI_SHA}\truntime/vivari`;
  if (gitlink.trim() !== expectedGitlink) {
    throw new Error(`runtime/vivari gitlink must remain ${PINNED_VIVARI_SHA}`);
  }
  if (submoduleHead.trim() !== PINNED_VIVARI_SHA) {
    throw new Error(`checked-out runtime/vivari HEAD must remain ${PINNED_VIVARI_SHA}`);
  }
}

export function validatePinnedVivariProvenance({ submoduleUrl, submoduleBranch }) {
  if (submoduleUrl.trim() !== VIVARI_MIRROR_URL) {
    throw new Error(`runtime/vivari must use owner-controlled mirror ${VIVARI_MIRROR_URL}`);
  }
  if (submoduleBranch.trim()) {
    throw new Error('runtime/vivari must not track a branch; the committed gitlink is authoritative');
  }
}

async function git(...args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout;
}

async function optionalGit(...args) {
  try {
    return await git(...args);
  } catch {
    return '';
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [gitlink, submoduleHead, submoduleUrl, submoduleBranch] = await Promise.all([
    git('ls-tree', 'HEAD', 'runtime/vivari'),
    git('-C', 'runtime/vivari', 'rev-parse', 'HEAD'),
    git('config', '-f', '.gitmodules', '--get', 'submodule.runtime/vivari.url'),
    optionalGit('config', '-f', '.gitmodules', '--get', 'submodule.runtime/vivari.branch'),
  ]);
  validatePinnedVivariSubmodule({ gitlink, submoduleHead });
  validatePinnedVivariProvenance({ submoduleUrl, submoduleBranch });
  console.log(`Vivari submodule provenance OK (${PINNED_VIVARI_SHA}; mirror and gitlink agree)`);
}
