# Proposal: add-wasm-safe-start-pipeline

## Intent

Los comandos `start` que el LLM emite (`npm install && npm run dev`) fallan en el guest vivari wasm32: el postinstall de esbuild exige binario nativo inexistente para `linux wasm32 LE`. La secuencia wasm-compatible fue **verificada a mano** y arranca un dev server real (Vite v5.4.8 ready). Este change hace que el action-shell Nexari ejecute esa secuencia determinista en lugar del comando crudo del modelo.

## What Changes

- BREAKING (solo ruta nexari): `createNexariActionShell.executeCommand` ya NO ejecuta el comando crudo del LLM cuando es un comando de instalación/arranque de proyecto (`npm install`, `npm run dev`, `npm run build`, etc.); lo reescribe como pipeline wasm-safe verificado.
- La reescritura es deterministic string-mapping, nunca generación dinámica: el shell emite la secuencia probada, no una variante del modelo.
- La ruta stackblitz queda intacta (comando crudo, comportamiento histórico).

## Capabilities

- **Nueva**: `wasm-safe-command-rewriting` — reescritura de comandos shell de proyecto a la secuencia wasm-safe del guest.

## Impact

- `~/Projects/bolt.diy-nexari-main/app/lib/runtime/nexari-action-shell.ts` (único archivo funcional).
- Tests: `nexari-action-shell.spec.ts` (regresiones nuevas).
- Riesgo controlado: comandos del usuario en la terminal del workbench (sesión manual) NO se reescriben — solo la lane de `runActionCommand` de acciones de artefacto.
