import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function serveNexariAssets(): Plugin {
  const assetsDir = path.resolve(fileURLToPath(new URL('../../runtime/vivari/packages/core/dist/assets/', import.meta.url)));
  const swPath = fileURLToPath(new URL('../../runtime/vivari/packages/core/dist/assets/sw.js', import.meta.url));
  if (!fs.existsSync(swPath)) throw new Error('Vivari SDK dist is missing; run npm run build:vivari from the Nexari root.');
  const middleware = (req: { url?: string }, res: any, next: () => void) => {
    for (const [name, value] of Object.entries(isolation)) res.setHeader(name, value);
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.end(fs.readFileSync(swPath));
      return;
    }
    if (pathname.startsWith('/assets/')) {
      const candidate = path.resolve(assetsDir, pathname.slice('/assets/'.length));
      if (candidate.startsWith(`${assetsDir}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        res.setHeader('Content-Type', candidate.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(fs.readFileSync(candidate));
        return;
      }
    }
    next();
  };
  return {
    name: 'nexari-serve-assets',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist/', import.meta.url));
      fs.copyFileSync(swPath, `${outDir}sw.js`);
      fs.cpSync(assetsDir, `${outDir}assets`, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [serveNexariAssets()],
  resolve: { alias: {
    '@nexari/vivari-adapter': fileURLToPath(new URL('../../packages/vivari-adapter/src/index.ts', import.meta.url)),
  } },
  server: { headers: isolation, fs: { allow: [fileURLToPath(new URL('../../runtime/vivari', import.meta.url))] } },
  preview: { headers: isolation },
  worker: { format: 'es' },
});
