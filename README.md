# Nexari

Nexari es un **runtime WebAssembly aislado y self-hosted** que ejecuta aplicaciones directamente en tu navegador — sin Docker, sin contenedores, sin nube. Un LLM puede generar un proyecto y Nexari lo escribe en un filesystem virtual, arranca los procesos y monta el preview en vivo, todo dentro de la misma pestaña.

Nace como fork mantenido de [Vivari](https://github.com/maitrungduc1410/vivari) (MIT) y cierra solo brechas de compatibilidad clean-room con evidencia, requeridas por una revisión pinned de solo-lectura de Bolt.DIY.

No es una VM Linux, ni un reemplazo de Docker, ni un runtime Node nativo, ni una copia de StackBlitz WebContainers.

## Qué aporta Nexari

El motor wasm es la base; Nexari es lo que hace que proyectos **reales** (npm/Vite generados por un LLM) funcionen de punta a punta en el navegador:

- **Pipeline de arranque wasm-safe** — la reescritura determinística de `npm install && npm run dev` a una secuencia wasm-safe (lockfile consistente, `esbuild-wasm`, `@rollup/wasm-node`) es responsabilidad del **host de integración (Bolt)**; Nexari recibe la secuencia ya verificada y monta/spawnea vía el SDK.
- **Bridge de preview** — detección del server in-VM y evento `server-ready (port, url)` para que el host conecte el iframe del preview. El dev server corre *y se ve*.
- **Bundle de assets verificado** — `@nexari/vivari-browser-assets`: tarball inmutable con SHA-256 por archivo y manifest (el manifest vive en `artifacts/browser-stack/manifest.json`). Los hashes son **metadata de empaquetado del bundle**: la verificación es responsabilidad del host de integración — el runtime no tiene gate de boot por hash. Un host limpio bootea el runtime completo (Service Worker, chunks, bridges, vendor) sin symlinks al repo productor.
- **Contrato tipado fail-closed** — `@nexari/runtime-contract`: los backends se seleccionan explícitamente y los consumidores fallan con errores tipados, nunca con fallbacks silenciosos.
- **Gates E2E deterministas** — smoke en browser real, verificación de procedencia por SHA-256 y checks locales reproducibles (`npm test`, `npm run test:browser-lab`).
- **Generación wasm-compatible** — atribuida al **host de integración (Bolt)**: el código que el LLM produce llega con overrides npm wasm-safe por construcción; Nexari lo ejecuta, no lo genera.

## Cómo encaja todo (Vivari → Nexari → Bolt)

```text
Vivari  = el motor WebAssembly (proyecto upstream, MIT)
Nexari  = NUESTRA versión mejorada y mantenida de ese motor — el runtime
Bolt    = el IDE en el navegador donde el LLM genera; Nexari ejecuta
```

Nexari **contiene** a Vivari por diseño: es un fork pineado (`runtime/vivari`, submódulo) del que se derivan los paquetes que Bolt consume. No se "extrae" — la trazabilidad de procedencia lo exige.

**Mapa de repos:**

| Repo | Qué es |
|---|---|
| **`EliabLemus/Nexari`** (este) | El runtime: contrato, adapter, assets, specs y verificación E2E. La fuente de verdad del motor. |
| [`EliabLemus/bolt-diy-nexari-runtime`](https://github.com/EliabLemus/bolt-diy-nexari-runtime) | El IDE: Bolt (fork de bolt.diy) con Nexari integrado y los tarballs compilados en `vendor/`. |
| `EliabLemus/nexari-vivari-provenance-20260922` | Espejo inmutable del punto exacto de Vivari del que partimos (público, para que el submódulo sea clonable por CI y terceros). |

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
pnpm run build:vivari

# 2. Instalar y correr el smoke lab (sirve con COOP/COEP + service worker)
pnpm install
cd labs/browser-smoke && npm install && npm run dev
# → http://127.0.0.1:5173 — verás el runtime bootear, el proceso correr
#   y el preview responder
```

También existe el runner E2E automatizado (`e2e/browser-smoke.e2e.mjs`), que requiere un Chrome aislado vía `NEXARI_CHROME_CDP_URL` (solo `http://127.0.0.1`).

### Qué verás en el lab (verificado 2026-11-16)

El boot del runtime wasm tarda ~30–60 s: la página muestra `Booting…` y luego pasa a `Ready`. Estado final esperado:

```text
Ready: in-VM HTTP server on 3111

> nexari-spawn-proof
> node npm-spawn-proof.js nexari-npm-argument
NEXARI_NPM_PROOF={"cwd":"/","option":"nexari-npm-option","args":["nexari-npm-argument"]}
ready
server-ready /preview/3111/
```

Y el iframe de preview renderiza **Nexari runtime preview OK**. Eso demuestra, sin Bolt, el runtime **Nexari** (fork mejorado y mantenido de Vivari): el kernel bootea en tu navegador, el guest ejecuta procesos Node (`spawn` con `cwd` pineado a `/`), levanta un servidor HTTP dentro de la VM y el preview lo sirve en vivo. Los botones `Teardown runtime` / `Reboot runtime` permiten destruir y reiniciar el runtime sin recargar la página.

Prueba automatizada equivalente (no necesita navegador abierto a mano):

```bash
npm run test:browser-lab   # → "browser lab E2E: PASS"
```

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
pnpm run generate:compatibility
pnpm test
pnpm run build
git diff --check
```

## Automation and releases

GitHub Actions corre checks deterministas en pull requests y `main`, más una verificación semanal read-only. Los releases son deliberadamente manuales: primero commitear metadata estable `X.Y.Z` en `package.json` y `CHANGELOG.md`, luego dispatch **Create Nexari Release** con esa versión exacta — valida el set completo de gates antes de crear el tag `vX.Y.Z` y el GitHub Release.

Nexari **no** publica paquetes npm. Ver [`CHANGELOG.md`](CHANGELOG.md) para el checklist de release.

## Source policy

Ver `compatibility/stackblitz-public-contract-ledger.md`, `compatibility/bolt-webcontainers-inventory.json`, `compatibility/bolt-open-runtime-issues.json` y el OpenSpec en `openspec/changes/add-bolt-compatible-vivari-runtime/`.
