# Delta: artifact generation

## MODIFIED Requirements

### Requirement: Los artefactos JS/TS generan package.json wasm-compatible

El system prompt de artefactos SHALL instruir al modelo que todo `package.json` de proyecto con Vite/Rollup incluya overrides npm wasm-safe: `"overrides": { "esbuild": "^0.28.2", "rollup": "npm:@rollup/wasm-node" }` (o estructura equivalente según packageManager del template).

#### Scenario: proyecto React+Vite generado incluye overrides

- **WHEN** el modelo genera un proyecto Vite (p. ej. todo app React con Tailwind)
- **THEN** el `package.json` emitido como archivo contiene el bloque de overrides con esbuild `^0.28.2` y rollup apuntando a `npm:@rollup/wasm-node`.

#### Scenario: la guía no rompe proyectos sin bundler nativo

- **WHEN** el modelo genera un proyecto estático (HTML/JS puro, sin vite)
- **THEN** no se exige ningún override; la instrucción es condicional a bundlers con binarios nativos.

### Requirement: La guía es verificable y no degrada el streaming

El cambio de prompt SHALL validararse con un unit test que confirme que la instrucción wasm-safe está presente en el prompt de artefactos, y con un E2E de generación real donde el `package.json` del artefacto contenga los overrides.

#### Scenario: test de presencia de instrucción

- **WHEN** se construye el system prompt (`optimized.ts`)
- **THEN** un test aserta que contiene la cadena canónica de overrides (`@rollup/wasm-node`).

#### Scenario: E2E de generación

- **WHEN** se genera un proyecto Vite real con backend nexari
- **THEN** el `package.json` recibido en el guest (leído vía `workbenchStore.files` o `runtime.fs.readFile`) contiene los overrides.
