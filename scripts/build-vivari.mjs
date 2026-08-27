import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime', 'vivari');
const toolchain = process.env.NEXARI_RUST_TOOLCHAIN ?? '1.88.0-aarch64-apple-darwin';

if (!/^[0-9A-Za-z._-]+$/.test(toolchain)) {
  throw new Error('NEXARI_RUST_TOOLCHAIN contains unsupported characters');
}

const bin = path.join(process.env.HOME ?? '', '.rustup', 'toolchains', toolchain, 'bin');
const rustc = path.join(bin, 'rustc');
if (!existsSync(rustc)) {
  throw new Error(`Rust toolchain ${toolchain} is not installed; run: rustup toolchain install ${toolchain} --profile minimal --target wasm32-unknown-unknown --target wasm32-wasip1`);
}

const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, RUSTUP_TOOLCHAIN: toolchain };
const exec = (command, args) => execFileSync(command, args, { cwd: runtimeDir, env, stdio: 'inherit' });
const targets = execFileSync(rustc, ['--print', 'target-list'], { env, encoding: 'utf8' });
if (!targets.split('\n').includes('wasm32-unknown-unknown')) {
  throw new Error(`${toolchain} does not expose wasm32-unknown-unknown`);
}

console.log(`Nexari Vivari build using ${toolchain}`);
// npm run build; npm run verify; npm run smoke
for (const script of ['build', 'verify', 'build:sdk', 'typecheck:sdk', 'smoke']) exec('npm', ['run', script]);
