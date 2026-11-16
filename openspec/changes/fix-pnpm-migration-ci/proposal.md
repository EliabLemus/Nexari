# Change: fix-pnpm-migration-ci

## Intent

El escaneo adversarial (Codex, 2026-11-16) encontró que la migración npm→pnpm (`91bb075`, `7b7365a`) rompe CI en checkout limpio y el workflow de release. Además corrige sobre-promesas del README señaladas por el mismo escaneo.

## What Changes

- MODIFIED: workflows (`.github/workflows/*.yml`) que ejecutan tests de assets/pack añaden `npm run --prefix runtime/vivari vendor:pnpm` ANTES de construir assets — los tests exigen `packages/studio/public/vendor/pnpm-pack.bin`, que está gitignored y `build:vivari` no genera.
- MODIFIED: `release.yml` elimina el separador `--` en `pnpm run check:release -- "$RELEASE_VERSION"` → `pnpm run check:release "$RELEASE_VERSION"` (pnpm 9.x transmite `--` literal; el script lee `argv[2]` y rechaza `--` como versión).
- MODIFIED: README "Qué aporta Nexari" — la verificación de hashes se describe como metadata de empaquetado del bundle (el manifest vive en `artifacts/browser-stack/manifest.json`; el host debe verificar, el runtime no tiene gate de boot por hash). La reescritura de comandos wasm-safe y la generación wasm-compatible se atribuyen al host de integración (Bolt), no al runtime; el runtime monta/spawnea vía el SDK.

## Capabilities

- **Modificada**: verificación CI de assets vendorizados; exactitud documental del README.

## Impact

- `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/verify-scheduled.yml` (si corre los mismos tests), `README.md`.
