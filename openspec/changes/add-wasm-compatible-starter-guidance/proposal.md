# Proposal: add-wasm-compatible-starter-guidance

## Intent

Los proyectos que el LLM genera asumen binarios nativos x64/arm (esbuild/rollup postinstall) y el guest vivari es `linux wasm32 LE`. El pipeline wasm-safe (`add-wasm-safe-start-pipeline`) ya corrige el arranque de forma determinista; este change hace que el código **generado** sea wasm-compatible por construcción, reduciendo la carga del pipeline y cubriendo installs intermedios.

## What Changes

- MODIFIED: la guía del system prompt de artefactos (`app/lib/common/prompts/optimized.ts`) instruye al modelo a escribir `package.json` con overrides npm wasm-safe (`esbuild@^0.28`, `rollup: npm:@rollup/wasm-node`) para todo proyecto Vite/Rollup.
- Los starters externos (GitHub via `STARTER_TEMPLATES` en `app/utils/constants.ts`, fetch por `selectStarterTemplate.ts`) NO son wasm-compatibles y no se pueden editar — el pipeline del action-shell (spec 1) cubre ese caso en runtime. Este change NO los modifica.

## Capabilities

- **Modificada**: generación de artefactos — package.json del proyecto generado incluye overrides wasm-safe.

## Impact

- `~/Projects/bolt.diy-nexari-main/app/lib/common/prompts/optimized.ts` (sección de artefactos JS/TS).
- Riesgo: prompts afectan TODOS los backends; la instrucción de overrides es inofensiva en StackBlitz (npm las aplica igual) — se mantiene única para no bifurcar prompts.
