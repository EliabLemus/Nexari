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
  runtime.on('server-ready', (port, url) => {
    preview.src = url;
    preview.hidden = false;
    status.dataset.state = 'ready';
    status.textContent = `Ready: in-VM HTTP server on ${port}`;
    write(`server-ready ${url}`);
    teardownButton.disabled = false;
  });
  const process = await runtime.spawn('node', ['server.js']);
  void (async () => { for await (const chunk of process.output) write(chunk); })();
  teardownButton.addEventListener('click', async () => {
    teardownButton.disabled = true;
    try {
      await runtime.teardown();
    } finally {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    status.dataset.state = 'terminated';
    status.textContent = 'Runtime terminated; preview detached';
  }, { once: true });
}

main().catch((error) => {
  status.dataset.state = 'failed';
  status.textContent = `Runtime failed: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
