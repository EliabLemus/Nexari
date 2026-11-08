# Delta: wasm-safe-command-rewriting

## ADDED Requirements

### Requirement: El action-shell nexari reescribe comandos de proyecto como pipeline wasm-safe

El sistema SHALL reescribir todo comando recibido en `executeCommand` que matchee un comando de instalación o arranque de proyecto (`npm install`, `npm ci`, `npm run dev`, `npm run build`, `npm run preview`) por la secuencia wasm-safe verificada, SIN ejecutar el comando original.

#### Scenario: start action del artefacto se reescribe

- **WHEN** el action-runner ejecuta el comando `npm install && npm run dev` vía `createNexariActionShell`
- **THEN** el guest ejecuta la secuencia COMPLETA de 4 pasos desde estado limpio: `npm install --ignore-scripts`, luego `npm install --no-save --ignore-scripts esbuild@0.28.2 @rollup/wasm-node`, luego el swap de `node_modules/rollup` por `@rollup/wasm-node` vía `node -e fs.cpSync`, y finalmente `npm run dev`; el output mostrado en el terminal refleja cada paso ejecutado.

#### Scenario: comandos con paquetes, cadenas o flags preservan la intención

- **WHEN** el comando es `npm install vite`, `npm run build && npm run preview`, o `npm run dev -- --host 0.0.0.0`
- **THEN** ninguna reescritura elimina paquetes u operaciones solicitadas: `npm install vite` instala `vite` (con los pasos wasm añadidos por ser bundler nativo); la cadena ejecuta AMBAS operaciones reescritas; los flags tras `--` se conservan en el paso final.
- **AND** las formas no reconocidas (p. ej. `yarn dev`) pasan crudas sin reescritura.

#### Scenario: comandos no-proyecto pasan intactos

- **WHEN** el shell recibe un comando que no es instalación/arranque de proyecto (p. ej. `ls -la` o `cat package.json`)
- **THEN** el comando se ejecuta tal cual vía `runtime.runActionCommand` sin reescritura.

#### Scenario: la lane de terminal manual no se ve afectada

- **WHEN** un usuario escribe un comando en el terminal del workbench (sesión interactiva, no `runActionCommand`)
- **THEN** el comando se ejecuta crudo; la reescritura aplica solo a acciones de artefacto.

### Requirement: La reescritura es determinista y testeable

El sistema SHALL implementar la reescritura como función pura exportada (p. ej. `rewriteWasmSafeCommand(command): string` o `null`) separada del shell, con unit tests que cubran cada comando mapeado, comandos con variantes (`npm install --legacy-peer-deps`, `pnpm install`) y el caso nulo.

#### Scenario: variantes de flag se normalizan al mismo pipeline

- **WHEN** el comando de proyecto incluye flags (`npm install --legacy-peer-deps`)
- **THEN** la salida reescrita es idéntica al pipeline estándar (los flags del modelo se descartan de forma segura).

#### Scenario: gestor distinto se rechaza explícito

- **WHEN** el comando usa `pnpm` o `yarn`
- **THEN** la reescritura produce el pipeline con npm (el guest no trae pnpm/yarn) y el output lo hace visible en el terminal.
