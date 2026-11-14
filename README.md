# Nexari

Nexari es un **runtime WebAssembly aislado y self-hosted** que ejecuta aplicaciones directamente en tu navegador — sin Docker, sin contenedores, sin nube. Un LLM puede generar un proyecto y Nexari lo escribe en un filesystem virtual, arranca los procesos y monta el preview en vivo, todo dentro de la misma pestaña.

Nace como fork mantenido de [Vivari](https://github.com/maitrungduc1410/vivari) (MIT) y cierra solo brechas de compatibilidad clean-room con evidencia, requeridas por una revisión pinned de solo-lectura de Bolt.DIY.

No es una VM Linux, ni un reemplazo de Docker, ni un runtime Node nativo, ni una copia de StackBlitz WebContainers.

## Probarlo con Bolt (experiencia completa)

Bolt + Nexari es el IDE en el navegador donde el LLM genera y **ejecuta** proyectos en vivo:

```bash
git clone https://github.com/EliabLemus/bolt-diy-nexari-runtime.git
cd bolt-diy-nexari-runtime
pnpm install
pnpm run dev
```

1. Abre `http://localhost:5173`.
2. Elige el modelo: Ollama local o un proveedor con API key (`OPEN_ROUTER_API_KEY` en `.env.local`).
3. Escribe un prompt (ej. *"create a canvas particles app"*) — los archivos se generan, el server arranca y el preview aparece en la misma pestaña, con terminal visible.

El backend de ejecución por defecto es Nexari; `VITE_RUNTIME_BACKEND` solo existe para opt-in explícito de otro backend. Guía de patrones verificados: [HOST-INTEGRATION-GUIDE.md](./HOST-INTEGRATION-GUIDE.md).

## Probarlo sin Bolt (runtime standalone)

El lab `labs/browser-smoke` arranca Nexari solo, sin IDE: monta un proyecto de prueba (un `server.js` con Node http, probes de stdin/TTY), lo ejecuta en el guest y muestra el preview en vivo.

Requisitos: Node 22, [Rust](https://rustup.rs) 1.88.0 con targets `wasm32-unknown-unknown` y `wasm32-wasip1` (para compilar el SDK de Vivari).

```bash
git clone https://github.com/EliabLemus/Nexari.git
cd Nexari

# 1. Compilar el SDK de Vivari (genera runtime/vivari/packages/core/dist)
npm ci --prefix runtime/vivari
npm run build:vivari

# 2. Instalar y correr el smoke lab (sirve con COOP/COEP + service worker)
npm ci
cd labs/browser-smoke && npm install && npm run dev
# → http://127.0.0.1:5173 — verás el runtime bootear, el proceso correr
#   y el preview responder
```

También existe el runner E2E automatizado (`e2e/browser-smoke.e2e.mjs`), que requiere un Chrome aislado vía `NEXARI_CHROME_CDP_URL` (solo `http://127.0.0.1`).

## Status

`0.1.0-dev` es el milestone de contrato-y-procedencia: establece el objetivo, la política de fuentes y los gates deterministas antes de cualquier integración de host o cambio de semántica del runtime.

## Host integration

Requisitos y patrones verificados E2E para hosts (servers detached, pin de cwd, kill de puerto stale, fallback HTML puro): [HOST-INTEGRATION-GUIDE.md](./HOST-INTEGRATION-GUIDE.md).

## Boundaries

- Bolt.DIY es un input de análisis únicamente. Este repositorio no lo modifica.
- Artefactos propietarios del runtime de StackBlitz están prohibidos. Documentación pública, el paquete API público y el comportamiento observable del host son los únicos inputs de compatibilidad.
- El baseline upstream importado de Vivari es `9a89ff328b87ad0fb6a180d4401ea418c180cbe7`; el checkout `runtime/vivari` commiteado está pineado aparte en `210d50d3f314b1fc6b148776ee24c2d48d8d022d` y guardado por `npm run check:vivari-submodule-pin`. Su remote `upstream` tiene push deshabilitado.
- Los hosts futuros consumen Nexari a través de `BrowserRuntime`; nunca importan el fork directamente.
- No hay fork remoto, publicación npm, deployment ni integración Bolt sin aprobación del Human Owner.

## Local gates

```text
npm run generate:compatibility
npm test
npm run build
git diff --check
```

## Automation and releases

GitHub Actions corre checks deterministas en pull requests y `main`, más una verificación semanal read-only. Los releases son deliberadamente manuales: primero commitear metadata estable `X.Y.Z` en `package.json` y `CHANGELOG.md`, luego dispatch **Create Nexari Release** con esa versión exacta — valida el set completo de gates antes de crear el tag `vX.Y.Z` y el GitHub Release.

Nexari **no** publica paquetes npm. Ver [`CHANGELOG.md`](CHANGELOG.md) para el checklist de release.

## Source policy

Ver `compatibility/stackblitz-public-contract-ledger.md`, `compatibility/bolt-webcontainers-inventory.json`, `compatibility/bolt-open-runtime-issues.json` y el OpenSpec en `openspec/changes/add-bolt-compatible-vivari-runtime/`.
