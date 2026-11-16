# Tasks: fix-pnpm-migration-ci

- [x] 1. Workflows que corren tests de assets/pack generan `pnpm-pack.bin` antes: añadir `npm run --prefix runtime/vivari vendor:pnpm` al step "Build Vivari vendor assets" de cada workflow afectado (ci.yml ambos jobs, verify-scheduled si aplica). **Verificación:** leer los yml; grep que cada test:browser-assets/pack tenga vendor:pnpm antes.
- [x] 2. release.yml: `pnpm run check:release "$RELEASE_VERSION"` sin `--`. **Verificación:** reproducir localmente `pnpm run check:release 0.1.0` → exit 0, y `pnpm run check:release -- 0.1.0` → falla (evidencia del bug).
- [x] 3. README "Qué aporta Nexari": (a) hashes = metadata de empaquetado del bundle, verificación es responsabilidad del host (el runtime no gatea boot por hash); (b) pipeline wasm-safe y generación wasm-compatible atribuidos al host de integración Bolt, no al runtime. **Verificación:** releer las viñetas 1, 3 y 6 contra la realidad del código del runtime.
- [x] 4. Suite completo: `pnpm run typecheck && pnpm test` en verde, exit codes reportados. Simular checkout limpio para CI: en un clone temporal, correr los pasos de vendor del workflow y luego los tests de assets.
