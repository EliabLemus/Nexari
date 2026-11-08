# Tasks: add-wasm-compatible-starter-guidance

- [ ] 1. Localizar la sección del prompt de artefactos JS/TS en `app/lib/common/prompts/optimized.ts` (grep `package.json`) y añadir instrucción condicional: para proyectos Vite/Rollup, `package.json` DEBE incluir overrides npm con `esbuild: ^0.28.2` y `rollup: npm:@rollup/wasm-node`. No tocar starters externos. **Verificación**: grep del archivo muestra la instrucción; diff mínimo.
- [ ] 2. Unit test que construya el prompt y aserte la presencia de `@rollup/wasm-node` en la sección de artefactos. **Verificación**: `npx vitest run app/lib/common/prompts` verde.
- [ ] 3. E2E: generación real (backend nexari, modelo vigente) → leer `package.json` del guest → asserts de overrides presentes. **Verificación**: salida del E2E manual con captura del contenido; task marcada solo con evidencia.
- [ ] 4. Crítica: confirmar que la instrucción no degrada proyectos estáticos (generar uno sin bundler y verificar que el modelo NO agrega overrides). **Verificación**: E2E manual anotado en el commit.
