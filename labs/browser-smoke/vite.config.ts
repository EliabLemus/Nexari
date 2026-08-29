import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function serveNexariServiceWorker(): Plugin {
  const swPath = fileURLToPath(new URL('../../runtime/vivari/packages/core/dist/assets/sw.js', import.meta.url));
  if (!fs.existsSync(swPath)) throw new Error('Vivari SDK dist is missing; run npm run build:vivari from the Nexari root.');
  const middleware = (req: { url?: string }, res: any, next: () => void) => {
    for (const [name, value] of Object.entries(isolation)) res.setHeader(name, value);
    if ((req.url ?? '').split('?')[0] === '/sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.end(fs.readFileSync(swPath));
      return;
    }
    next();
  };
  return {
    name: 'nexari-serve-sw',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
    closeBundle() { fs.copyFileSync(swPath, fileURLToPath(new URL('./dist/sw.js', import.meta.url))); },
  };
}

export default defineConfig({
  plugins: [serveNexariServiceWorker()],
  resolve: { alias: {
    '@nexari/vivari-adapter': fileURLToPath(new URL('../../packages/vivari-adapter/src/index.ts', import.meta.url)),
  } },
  server: { headers: isolation, fs: { allow: [fileURLToPath(new URL('../../runtime/vivari', import.meta.url))] } },
  preview: { headers: isolation },
  worker: { format: 'es' },
});
