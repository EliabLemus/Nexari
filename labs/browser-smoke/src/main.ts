import { createVivariRuntime, loadPinnedVivariSdk } from '../../../packages/vivari-adapter/src/index.ts';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const output = document.querySelector<HTMLPreElement>('#output')!;
const preview = document.querySelector<HTMLIFrameElement>('#preview')!;
const teardownButton = document.querySelector<HTMLButtonElement>('#teardown')!;

const write = (line: string) => { output.textContent += `${line}\n`; };
const project = {
  'server.js': { file: { contents: [
    "import { createServer } from 'node:http';",
    "const server = createServer((_, res) => { res.setHeader('content-type', 'text/plain'); res.end('Nexari runtime preview OK'); });",
    "server.listen(3111, () => console.log('ready'));",
  ].join('\n') } },
  'stdin-echo.js': { file: { contents: [
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => process.stdout.write(`stdin:${chunk}`));",
  ].join('\n') } },
};

async function main() {
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    status.dataset.state = 'isolation-failed';
    status.textContent = 'Isolation prerequisite failed';
    return;
  }
  status.dataset.state = 'booting';
  status.textContent = 'Booting pinned Vivari runtime…';
  const runtime = createVivariRuntime({ id: crypto.randomUUID(), loadSdk: loadPinnedVivariSdk });
  await runtime.boot();
  runtime.attachPreview(preview);
  await runtime.mount(project);
  const fsProofPath = '/nexari-fs-proof.txt';
  const fsProofContents = 'Nexari filesystem bridge proof';
  await runtime.fs.writeFile(fsProofPath, fsProofContents);
  const readBack = await runtime.fs.readFile(fsProofPath, 'utf8');
  const listedBeforeRemoval = await runtime.fs.readdir('/');
  await runtime.fs.rm(fsProofPath);
  const listedAfterRemoval = await runtime.fs.readdir('/');
  if (readBack !== fsProofContents || !listedBeforeRemoval.includes('nexari-fs-proof.txt') || listedAfterRemoval.includes('nexari-fs-proof.txt')) {
    throw new Error('Vivari filesystem CRUD proof failed');
  }
  status.dataset.fsProof = 'write-read-readdir-rm-readdir';
  const fsBinaryProofPath = '/nexari-fs-proof.bin';
  const fsBinaryPayload = new Uint8Array([0, 1, 127, 128, 254, 255]);
  await runtime.fs.writeFile(fsBinaryProofPath, fsBinaryPayload);
  const fsBinaryReadBack = await runtime.fs.readFile(fsBinaryProofPath);
  await runtime.fs.rm(fsBinaryProofPath);
  if (!(fsBinaryReadBack instanceof Uint8Array)
    || fsBinaryReadBack.length !== fsBinaryPayload.length
    || fsBinaryReadBack.some((byte, index) => byte !== fsBinaryPayload[index])) {
    throw new Error('Vivari binary filesystem proof failed');
  }
  status.dataset.fsBinaryProof = 'write-bytes-read-bytes-rm';
  const stdinToken = 'nexari-stdin-round-trip';
  const stdinProcess = await runtime.spawn('node', ['stdin-echo.js']);
  const stdinWriter = stdinProcess.input.getWriter();
  await stdinWriter.write(stdinToken);
  await stdinWriter.close();
  let stdinOutput = '';
  for await (const chunk of stdinProcess.output) stdinOutput += chunk;
  if (!stdinOutput.includes(`stdin:${stdinToken}`)) {
    throw new Error('Vivari process stdin proof failed');
  }
  status.dataset.stdinProof = 'written-echoed';
  runtime.on('port', (port, kind, url) => {
    if (kind === 'open' && port === 3111) status.dataset.portOpen = `${port}:${url}`;
  });
  runtime.on('server-ready', (port, url) => {
    preview.src = url;
    preview.hidden = false;
    status.dataset.state = 'ready';
    status.textContent = `Ready: in-VM HTTP server on ${port}`;
    write(`server-ready ${url}`);
    teardownButton.disabled = false;
  });
  const process = await runtime.spawn('node', ['server.js']);
  void process.exit.then((code) => { status.dataset.exitCode = String(code); });
  void (async () => {
    for await (const chunk of process.output) write(chunk);
    status.dataset.outputClosed = 'true';
  })();
  teardownButton.addEventListener('click', async () => {
    teardownButton.disabled = true;
    try {
      await runtime.teardown();
    } catch (error) {
      status.dataset.state = 'failed';
      status.textContent = `Runtime teardown failed: ${error instanceof Error ? error.message : String(error)}`;
      teardownButton.disabled = false;
      return;
    } finally {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    status.dataset.state = 'terminated';
    status.textContent = 'Runtime terminated; preview detached';
  });
}

main().catch((error) => {
  status.dataset.state = 'failed';
  status.textContent = `Runtime failed: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
