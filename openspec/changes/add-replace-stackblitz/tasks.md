# Tasks: add-replace-stackblitz

Todas las tareas empiezan pendientes. Este documento especifica comandos
para una ejecución posterior; su inclusión no implica que se hayan ejecutado.

No se solicita implementar código ni crear un runner de pruebas nuevo.
Cuando los tests existentes no acrediten una propiedad, registrar
SIN-COBERTURA o usar el procedimiento de navegador indicado.

## Reglas de ejecución y aceptación

Directorios:

- SPEC_REPO = ~/Projects/nexari-boltdiy-integration
- APP_REPO = ~/Projects/bolt.diy-nexari-main

Los comandos pnpm siguientes se ejecutan desde APP_REPO y utilizan las
dependencias ya instaladas. No instalar, actualizar ni reconstruir paquetes
para ocultar diferencias con el entorno evaluado.

Cada tarea debe registrar:

- checkout y estado del árbol;
- comando o procedimiento exacto;
- código de salida, cuando corresponda;
- aserciones observadas;
- evidencia identificable;
- estado PASS, FAIL, NO-EJECUTADO, SIN-COBERTURA,
  NO-VERIFICABLE-E2E o NO-EVALUABLE-ENTORNO.

No marcar una tarea completa solo porque exista su archivo de test.
Un test que usa mocks no acredita generación, guest real o navegador.

## T01 — Registrar procedencia y excluir stale servers

- [ ] 1.1 Registrar ambos checkouts.

En cada repositorio:

```sh
pwd -P
git rev-parse HEAD
git status --short
git diff --stat
```

Aceptación:

- Las rutas corresponden a los repositorios declarados.
- Se registran cambios locales; un HEAD aislado no identifica archivos
  modificados.
- La evidencia posterior corresponde a esos mismos contenidos.

- [ ] 1.2 Registrar versiones y hashes de la aplicación y runtime.

En APP_REPO:

```sh
node --version
pnpm --version
shasum -a 256 package.json pnpm-lock.yaml
shasum -a 256 app/lib/runtime/nexari-action-shell.ts app/lib/runtime/nexari-runtime.ts app/lib/runtime/nexari-runtime-facade.ts app/lib/stores/previews.ts app/lib/stores/workbench.ts app/components/workbench/Preview.tsx
shasum -a 256 node_modules/@vivari/core/dist/index.js node_modules/@nexari/vivari-adapter/dist/index.js
shasum -a 256 node_modules/@nexari/vivari-browser-assets/dist/sw.js
shasum -a 256 node_modules/@nexari/vivari-browser-assets/dist/assets/kernel-worker-*.js
```

Aceptación:

- Los archivos existen y sus hashes quedan asociados a la ejecución.
- Se registra también la versión resuelta de Vite, esbuild y Rollup dentro
  del guest; las versiones de dependencias del host no las sustituyen.

- [ ] 1.3 Reservar un puerto del host sin reutilizar un servidor desconocido.

Comprobación:

```sh
lsof -nP -iTCP:5187 -sTCP:LISTEN
```

Aceptación:

- No hay listener antes del arranque de aceptación.
- Si existe uno, identificarlo o seleccionar otro puerto libre y registrar
  la sustitución en todos los pasos. No matarlo indiscriminadamente.

En una sesión dedicada, desde APP_REPO:

```sh
VITE_RUNTIME_BACKEND=nexari pnpm exec remix vite:dev --host 127.0.0.1 --port 5187 --strictPort
```

Después:

```sh
lsof -nP -iTCP:5187 -sTCP:LISTEN
```

Para el PID obtenido:

```sh
ps -p <PID> -o pid=,ppid=,lstart=,command=
lsof -a -p <PID> -d cwd
```

Aceptación:

- El proceso sirve el checkout registrado.
- strictPort impide aceptar silenciosamente otro puerto.
- Se distingue 5187, puerto del host, del puerto Vite dentro del guest.

- [ ] 1.4 Usar un perfil de navegador nuevo y vacío para la prueba.

Aceptación:

- No se reutilizan cookies, Cache Storage, Service Workers, IndexedDB,
  OPFS ni guest de ejecuciones anteriores.
- Se registra URL, versión del navegador y URL del Service Worker activo.
- No se elimina almacenamiento del perfil habitual del usuario.
- Una discrepancia de procedencia produce NO-EVALUABLE-ENTORNO.

Escenarios: S26.

## T02 — Verificar selección y ausencia de fallback

- [ ] 2.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/runtime-selector.spec.ts app/lib/runtime/browser-runtime.spec.ts app/lib/runtime/nexari-composition.spec.ts app/lib/runtime/action-shell-selector.spec.ts app/lib/runtime/action-runner-runtime-selector.spec.ts app/lib/runtime/files-store-runtime-selector.spec.ts app/lib/runtime/previews-runtime-selector.spec.ts app/lib/runtime/webcontainer-import-guard.spec.ts
```

- [ ] 2.2 Inspeccionar:

```sh
rg -n 'VITE_RUNTIME_BACKEND|return .stackblitz.|bootStackblitz|bootNexari|@webcontainer/api' app/lib/runtime/runtime-selector.ts app/lib/runtime/browser-runtime.ts app/lib/webcontainer/index.ts
```

Aceptación:

- Todos los tests seleccionados pasan y el comando termina con código 0.
- El perfil Nexari no llama al boot StackBlitz como recuperación.
- La selección inválida falla de forma visible.
- Se documenta que ausencia de configuración conserva el default
  StackBlitz; el perfil aceptado declara explícitamente nexari.
- El import guard es evidencia estructural, no prueba de ausencia de red.

Escenario: S01.

## T03 — Verificar boot, procesos y action lane finito

- [ ] 3.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/vivari-guest-factory.spec.ts app/lib/runtime/nexari-app-boot.spec.ts app/lib/runtime/nexari-runtime.spec.ts app/lib/runtime/nexari-runtime-facade.spec.ts
```

- [ ] 3.2 Inspeccionar:

```sh
rg -n 'adaptVivariGuest|await guest.boot|return adaptVivariGuest|input:|stdout:|stderr:|exit:|kill|Promise.all|spawn.*sh' app/lib/runtime/vivari-guest-factory.ts app/lib/runtime/nexari-runtime.ts app/lib/runtime/nexari-runtime-facade.ts
```

Aceptación:

- Boot devuelve el guest adaptado, no undefined.
- El fixture guest tiene input/stdout/stderr/exit/kill.
- El fixture de fachada puede tener output combinado.
- runActionCommand ejecuta sh -c y espera stdout, stderr y exit.
- Los códigos no cero se conservan.
- La cancelación del comando finito no espera indefinidamente su exit.
- Los tests terminan con código 0.

Escenarios: S03, S04 y parte adapter de S15.

## T04 — Verificar reescritura, orden, passthrough y fallos

- [ ] 4.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/nexari-action-shell.spec.ts
```

- [ ] 4.2 Contrastar cada fila de la tabla del spec con:

```sh
sed -n '1,320p' app/lib/runtime/nexari-action-shell.ts
sed -n '105,365p' app/lib/runtime/nexari-action-shell.spec.ts
```

Aceptación:

- I, W y R coinciden con las constantes del spec.
- npm install && npm run dev prepara una vez y arranca una vez.
- build && preview conserva ambos objetivos en orden.
- Los paquetes y flags de los casos enumerados se conservan exactamente.
- npm install&&npm run dev y yarn dev quedan fuera del mapping.
- Para null se pasa el string original a runActionCommand.
- El fallo de W con 37 impide R y spawn del servidor.
- El resultado conserva 37, no un código genérico.
- La prueba de signal acredita su paso directo al shell; no se presenta
  como prueba de cancelación desde ActionRunner.
- El comando de tests termina con código 0.

Registrar por fila si la evidencia es test existente o lectura.
No generalizar estos casos a un parser de shell completo.

Escenarios: S05 —estructura—, S06, S07, S13 y parte directa de S15.

## T05 — Verificar finalización del servidor independiente de exit

- [ ] 5.1 Ejecutar las pruebas existentes de servidor persistente:

```sh
pnpm exec vitest run app/lib/runtime/nexari-action-shell.spec.ts -t 'never sends a project command raw|resolves a slow-starting server step'
```

- [ ] 5.2 Auditar todas las rutas de finalización:

```sh
rg -n -C 6 'runServerStep|SERVER_STEP_TIMEOUT_MS|SERVER_OUTPUT_READY_PATTERN|process.exit|settle|server-ready|detachReady|detachPort' app/lib/runtime/nexari-action-shell.ts
```

Aceptación:

- Los fixtures relevantes mantienen exit pendiente.
- El servidor usa spawn('sh', ['-c', step], ...).
- Los listeners se registran antes del spawn.
- server-ready permite resolver sin exit.
- port:open, output reconocido y timeout solo aceptan/liberan la acción.
- El timeout es 30 000 ms desde runServerStep.
- settle está protegido frente a resolución múltiple.
- Se retiran suscripciones y temporizador al finalizar el paso.
- Ninguna rama de process.exit resuelve o llama a settle.

Gate estricto:

La implementación leída contiene una rama process.exit.then que llama a
settle. Mientras exista esa ruta, S10 es FAIL por lectura, aunque los tests
seleccionados pasen.

La regresión con guest sintético y exit=Promise.resolve(0) no demuestra S08.
No etiquetarla como E2E.

Escenarios: S08, S09 y S10.

## T06 — Verificar terminal visible y separación de sesiones

- [ ] 6.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/nexari-terminal.spec.ts app/lib/stores/terminal.spec.ts app/lib/runtime/action-runner.spec.ts
```

- [ ] 6.2 Trazar el recorrido del output:

```sh
rg -n 'executeCommand|resp.*output|terminal.write|process.output|runActionCommand|_attachNexariTerminal' app/lib/runtime/action-runner.ts app/lib/runtime/action-shell-selector.ts app/lib/runtime/nexari-action-shell.ts app/lib/runtime/nexari-terminal.ts app/lib/stores/terminal.ts
```

Aceptación estructural:

- Se identifica una conexión concreta entre output del action lane y la
  terminal visible de acciones.
- La lectura de process.output de una sesión interactiva independiente
  no se acepta como esa conexión.
- El test que aserta result.output no demuestra presentación visual.

Si no se identifica la conexión, registrar FAIL estructural para el
recorrido exigido; no inventar una conexión implícita.

Aceptación visual, mediante T10/T11:

- Se ven los comandos realmente ejecutados.
- Se ve stdout y stderr de la acción.
- El servidor no necesita terminar para que aparezca el output.
- La terminal manual sigue respondiendo por separado.
- Captura o transcripción identifica terminal, acción e intento.

Escenarios: S07, S11 y S12.
Sin navegador: componente visual NO-VERIFICABLE-E2E.

## T07 — Verificar cola y propagación de cancelación

- [ ] 7.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/action-runner.spec.ts
```

- [ ] 7.2 Inspeccionar:

```sh
rg -n -C 8 'addToExecutionQueue|globalExecutionQueue' app/lib/stores/workbench.ts
rg -n -C 6 'executeCommand|abortSignal|runStartAction|status.*complete|status.*failed' app/lib/runtime/action-runner.ts
```

Aceptación:

- addToExecutionQueue encadena el callback tanto para cumplimiento como
  para rechazo de la tarea anterior.
- No se interpreta el retraso de 2 segundos del runner como readiness.
- El estado complete del start se vincula a su promesa, no solo a liberar
  el runner para otras acciones.
- Se inspecciona si action.abortSignal llega al cuarto argumento del shell.
- No se afirma cancelación UI únicamente a partir de los tests del adapter.
- La secuencia real A rechazada → B → C se verifica en T11.

Evidencia inicial:

- then(callback, callback) respalda la recuperación estructural de la cola.
- Las llamadas inspeccionadas no transmiten action.abortSignal.
- Los tests de ActionRunner no sustituyen una prueba de WorkbenchStore
  completo.

Escenarios: S14 y S15.

## T08 — Verificar eventos, readiness y consumidor de preview

- [ ] 8.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/runtime/nexari-runtime-facade.spec.ts app/lib/runtime/previews-runtime-selector.spec.ts app/lib/stores/previews.spec.ts
```

- [ ] 8.2 Inspeccionar store y componente:

```sh
rg -n -C 5 'server-ready|ready:|ready =|type === .close.|getPreviewId' app/lib/stores/previews.ts
rg -n 'activePreview|ready|iframeUrl|No preview available' app/components/workbench/Preview.tsx
```

- [ ] 8.3 Inspeccionar transporte y sondeo instalados:

```sh
rg -n 'previewUrlFor|serviceWorker.register|emit.*server-ready|emit.*port' node_modules/@vivari/core/dist/index.js
rg -n -C 8 'async function waitServing' node_modules/@vivari/core/dist/assets/kernel-worker-*.js
```

Aceptación:

- Los tests de late-binding usan la fachada real.
- Detach anterior a boot evita la suscripción posterior.
- Detach posterior corta entregas.
- port:open registra ready=false.
- server-ready inserta o actualiza una entrada ready=true.
- server-ready repetido no duplica el puerto.
- close elimina una entrada existente.
- Reapertura exige nueva disponibilidad.
- La UI también respeta ready: no basta con que lo haga el store.
- Se documenta el transporte local observado y el significado real de
  waitServing, incluidas respuestas 404/500 y peticiones colgadas.

Evidencia inicial:

Preview.tsx usa la existencia de activePreview para renderizar y no consulta
ready. Esto impide aprobar S21 para la UI con los tests actuales del store.

Escenarios: S09, S20, S21, S22, S23 y parte store de S24.
Transporte efectivo y UI: NO-VERIFICABLE-E2E sin navegador.

## T09 — Verificar prompt efectivo, assets y checks de aplicación

- [ ] 9.1 Ejecutar:

```sh
pnpm exec vitest run app/lib/common/prompts/optimized.test.ts app/lib/runtime/nexari-browser-assets-plugin.spec.ts
```

- [ ] 9.2 Inspeccionar selección del prompt:

```sh
rg -n 'default:|optimized:|getFineTunedPrompt|getPropmtFromLibrary' app/lib/common/prompt-library.ts
rg -n 'promptId|getPropmtFromLibrary' app/lib/.server/llm/stream-text.ts
rg -n 'WASM-COMPATIBLE|overrides|0.28.2|@rollup/wasm-node|static projects' app/lib/common/prompts/optimized.ts
```

Aceptación:

- optimized contiene ambos overrides y la condición para proyectos
  estáticos.
- El procedimiento E2E selecciona optimized en Settings → Prompt Library.
- Se registra promptId efectivo en la solicitud de generación.
- No se atribuye la guía a default sin evidencia.

- [ ] 9.3 Comprobar assets locales y headers del servidor de T01:

```sh
curl --fail --silent --show-error --head http://127.0.0.1:5187/
curl --fail --silent --show-error --head http://127.0.0.1:5187/sw.js
curl --fail --silent --show-error --head http://127.0.0.1:5187/__vv-preview-boot.html
curl --fail --silent --show-error http://127.0.0.1:5187/sw.js | shasum -a 256
```

Aceptación:

- Los recursos responden correctamente.
- El documento principal establece aislamiento compatible con
  crossOriginIsolated; los assets tienen el MIME esperado.
- El hash servido de sw.js coincide con el instalado.
- Se repite la comparación para la URL exacta del kernel worker observada.
- curl verifica assets del host; no sustituye la ruta de preview dentro del
  Service Worker del navegador.

- [ ] 9.4 Ejecutar checks generales una vez sobre el mismo checkout:

```sh
pnpm run typecheck
pnpm test
```

Aceptación:

- Ambos comandos terminan con código 0.
- No hay tests fallidos, errores no manejados ni exclusiones añadidas para
  producir un resultado verde.
- Un fallo previo se registra; no se convierte en PASS por atribuirlo a
  otra parte del repositorio.

Escenarios: S02 —assets—, S17 y parte textual de S19.

## T10 — E2E de generación → Vite ready → iframe render

Esta tarea requiere navegador vivo.
Sin él: NO-VERIFICABLE-E2E.

- [ ] 10.1 Preparar una ejecución identificable.

Precondiciones:

- T01 válido.
- Captura de red de T12 iniciada antes de navegar.
- Perfil nuevo; guest sin node_modules ni servidor anterior.
- Backend efectivo nexari.
- Prompt Library = optimized.
- Proveedor y modelo efectivos registrados.
- Para cierre 100% local: modelo local y dependencias aprovisionadas
  localmente; no se permite sustituirlo por un proveedor remoto.
- Identificador único, por ejemplo NEXARI-E2E-20261108-<sufijo>.

En DevTools, comprobar:

```js
({
  origin: location.origin,
  crossOriginIsolated,
  sharedArrayBuffer: typeof SharedArrayBuffer,
  serviceWorker: navigator.serviceWorker.controller?.scriptURL
})
```

Resultado exigido:

- origin del host declarado;
- crossOriginIsolated=true;
- SharedArrayBuffer disponible;
- Service Worker local correspondiente al paquete registrado.

- [ ] 10.2 Solicitar generación real desde el chat.

Prompt de prueba:

“Crea una aplicación mínima React con Vite. Debe mostrar exactamente
NEXARI-E2E-20261108-<sufijo>, un contador inicialmente en 0 y un botón
Incrementar que lo aumente. No uses recursos externos. Emite los archivos
completos y una acción final de arranque npm install && npm run dev.”

Aceptación:

- La solicitud utiliza promptId=optimized.
- Se observa contenido incremental antes del final de la respuesta.
- Se registra el artefacto generado y sus acciones.
- No se reemplaza la generación por una fixture o por archivos copiados
  manualmente para declarar PASS.

- [ ] 10.3 Verificar el manifiesto y dependencias dentro del guest.

Usar el lector del runtime o la terminal guest; no el filesystem del host.

Comandos de inspección en la terminal guest:

```sh
cat package.json
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); console.log(JSON.stringify(p.overrides));"
node -e "const fs=require('fs'); for (const n of ['vite','esbuild','rollup','@rollup/wasm-node']) { const p=JSON.parse(fs.readFileSync('node_modules/'+n+'/package.json','utf8')); console.log(n,p.name,p.version); }"
```

Aceptación:

- package.json es válido.
- overrides.esbuild es ^0.28.2.
- overrides.rollup es npm:@rollup/wasm-node.
- W instala esbuild 0.28.2.
- Existe node_modules/@rollup/wasm-node.
- El contenido copiado a node_modules/rollup corresponde al paquete WASM.
- Se registran versiones reales; no se supone compatibilidad por rangos.

- [ ] 10.4 Verificar orden, readiness y acción.

Aceptación:

- Evidencia de I → W → R → npm run dev.
- El servidor fue lanzado por la acción del artefacto.
- Se observa output Vite ready del intento.
- Se observa server-ready(port, url) del mismo intento.
- Se registra el estado final de la acción.
- La acción finaliza y el servidor sigue respondiendo.
- La terminal visible presenta el output del action lane.
- No se acepta solo “[wasm-safe] server step accepted” como prueba de
  Vite ready o de respuesta HTTP.

- [ ] 10.5 Verificar iframe y ejecución de JavaScript.

En DevTools, para el perfil local con acceso al documento del iframe:

```js
const previewFrame = document.querySelector('iframe[title="preview"]');
({
  src: previewFrame?.getAttribute('src'),
  url: previewFrame?.contentWindow?.location.href,
  text: previewFrame?.contentDocument?.body.innerText
})
```

Si el transporte observado usa otro origen local y prohíbe acceso directo,
seleccionar el contexto del iframe en DevTools y leer allí
location.href y document.body.innerText. No modificar el transporte para
facilitar la comprobación.

Aceptación:

- La URL corresponde al puerto publicado mediante el transporte registrado.
- El documento y los módulos necesarios cargan correctamente.
- El marcador único aparece visible dentro del iframe.
- El contador empieza en 0 y, al pulsar Incrementar, cambia a 1.
- No se acepta un iframe vacío, una página de error ni un 200 con módulos
  fallidos.
- Se conservan captura, URL, marcador, estado de acción y evidencia de red.

- [ ] 10.6 Repetir preparación limpia y comprobar ausencia de dependencia
  accidental de overrides.

Ejecutar otra sesión guest limpia con un starter Vite cuyo package.json
no incluya overrides, usando la acción real de arranque.

Aceptación:

- I, W y R preparan el proyecto sin node_modules previo.
- El servidor arranca y el iframe muestra el marcador de esta sesión.
- No se reutiliza el servidor del E2E anterior.
- Esta prueba complementa la generación real; no la sustituye.

- [ ] 10.7 Comprobar generación estática.

En otra conversación/proyecto limpio, solicitar HTML/CSS/JS puro,
sin bundler ni dependencias.

Aceptación:

- No se fuerzan Vite, package.json ni overrides.
- La evidencia es el artefacto generado; encontrar la instrucción
  condicional en optimized.ts no basta.

Escenarios: S02, S05, S08, S11, S17, S18, S19 y S25.

## T11 — E2E de fallos, terminal, cola y ciclo de vida

Esta tarea requiere navegador vivo.
Sin él: NO-VERIFICABLE-E2E.

Las acciones de prueba deben recorrer el ActionRunner y WorkbenchStore
reales. Ejecutarlas solo en la terminal manual no acredita estos escenarios.

- [ ] 11.1 Diferenciar output de acciones de output interactivo.

Usar una acción shell del artefacto con:

```sh
node -e "console.log('ACTION-OUT-<sufijo>'); console.error('ACTION-ERR-<sufijo>')"
```

Después escribir manualmente:

```sh
echo MANUAL-<sufijo>
```

Aceptación:

- Ambos marcadores ACTION aparecen en la terminal visible de acciones.
- El marcador MANUAL aparece al usar la sesión interactiva.
- Los comandos se ejecutan una vez y por la vía correspondiente.

- [ ] 11.2 Verificar fallo seguido de trabajo posterior.

Ejecutar secuencialmente acciones A, B y C:

A:

```sh
node -e "console.error('FAIL-<sufijo>'); process.exit(37)"
```

B:

```sh
node -e "console.log('AFTER-B-<sufijo>')"
```

C:

```sh
node -e "console.log('AFTER-C-<sufijo>')"
```

Aceptación:

- A queda failed con diagnóstico y código 37.
- B y C completan una vez, en ese orden, sin recargar.
- Esta prueba de fallo de comando se complementa con la inspección de
  then(callback, callback): un ActionRunner que absorbe internamente el
  error no demuestra por sí solo rechazo de la promesa global.

Para acreditar específicamente el rechazo de la cola puede usarse, en
DevTools del servidor Vite, el WorkbenchStore real:

```js
const { workbenchStore } =
  await import('/app/lib/stores/workbench.ts');
const queueProof = [];

workbenchStore.addToExecutionQueue(async () => {
  queueProof.push('A');
  throw new Error('QUEUE-REJECTION-PROBE');
});
workbenchStore.addToExecutionQueue(async () => {
  queueProof.push('B');
});
workbenchStore.addToExecutionQueue(async () => {
  queueProof.push('C');
});

await new Promise((resolve) => setTimeout(resolve, 0));
queueProof;
```

Aceptación: ['A', 'B', 'C'], sin sustituir la implementación de la cola.
Esta comprobación es instrumentación de verificación, no código de producto.

- [ ] 11.3 Verificar bind sin respuesta.

Ejecutar mediante una acción shell, en guest dedicado:

```sh
node -e "require('http').createServer(()=>{}).listen(5199)"
```

Aceptación:

- Observar port:open para 5199 sin server-ready durante una ventana
  registrada de 35 segundos desde la apertura.
- La entrada no se presenta como preview disponible.
- No atribuir un límite temporal efectivo de waitServing a esta prueba:
  la petición puede permanecer colgada.
- Terminar la sesión de prueba antes del siguiente caso.

- [ ] 11.4 Distinguir respuesta HTTP de aplicación válida.

En otra sesión dedicada:

```sh
node -e "require('http').createServer((q,s)=>{s.writeHead(500);s.end('EXPECTED-500')}).listen(5199)"
```

Aceptación:

- Si el SDK emite server-ready, se registra como readiness de su sondeo.
- El resultado no satisface el gate de render React+Vite.
- No se modifica la definición del SDK para convertir 500 en “sin respuesta”.

- [ ] 11.5 Cancelar y reintentar.

En ejecuciones separadas, cancelar desde la acción/UI durante I, W, R y
el paso de servidor.

Aceptación por fase:

- Se identifica la fase realmente interrumpida.
- La señal llega al trabajo activo.
- No empiezan pasos posteriores del intento cancelado.
- No se usa la salida de un intento anterior.
- Al reintentar, vuelven a ejecutarse I, W y R.
- El iframe muestra un marcador nuevo después del reintento.

Si no se logra observar la fase R por su brevedad, registrar SIN-COBERTURA
para esa fase; no marcarla como probada.

No exigir teardown/reboot automático: no forma parte del contrato actual
de cancelación del adapter.

- [ ] 11.6 Cerrar, reabrir, guardar y recargar.

Con el servidor del E2E:

1. Guardar un cambio del marcador mediante el editor.
2. Pulsar la recarga explícita del preview.
3. Confirmar el marcador nuevo.
4. Detener el servidor guest identificado.
5. Confirmar retirada del preview disponible.
6. Arrancar de nuevo mediante la acción.
7. Confirmar nuevo server-ready y render del intento nuevo.

Aceptación:

- El iframe refleja el contenido actualizado.
- No queda disponible el preview del proceso cerrado.
- La reapertura no hereda readiness anterior.
- No se declara HMR automático a partir de esta recarga.

Escenarios: S12, S14, S15, S16, S21, S23 y S24.

## T12 — Verificar cero dominios StackBlitz y decidir cierre

Registro de la ejecución del fix del parser (apéndice T12, 2026-11-11):

- Checkout APP: `~/.worktrees/subagent-sa-0-7500bd9c`, rama
  `hermes-subagent/subagent-sa-0-7500bd9c`, commit `288e2332`
  ("fix(parser): synthetic boltArtifact wrapper for bare boltAction streams").
- Causa raíz confirmada: el stream real capturado
  (`scripts/chat-stream.txt`, Ollama/qwen3:4b-64k) contiene
  `<boltAction>` SIN `<boltArtifact>` → `onArtifactOpen` nunca dispara y
  el workbench no monta.
- Fix: `EnhancedStreamingMessageParser` inyecta un `<boltArtifact>`
  sintético antes del primer `<boltAction>` desnudo; como el parser base es
  un escáner acumulativo con cursor por mensaje y `useMessageParser`
  concatena el output devuelto, la inyección es estable en re-parses
  acumulativos y el output ya emitido se suprime con un contador por
  mensaje (sin duplicar texto en el chat).
- Evidencia: `app/lib/runtime/enhanced-message-parser.capture.spec.ts`
  repite el stream REAL capturado y acredita 1 `artifactOpen`,
  4 `actionOpen:file`, `actionClose:shell` — PASS (antes: 0 callbacks).
- Gates: suite completa 268/268 PASS; `pnpm run typecheck` PASS
  (exit 0). Dev server del puerto 5173 (PID 38560) eliminado al terminar;
  puerto libre verificado.

Registro del segundo intento E2E con navegador vivo (apéndice T12,
2026-11-11, segunda pasada delegada):

- Setup: worktree `~/.worktrees/subagent-sa-0-7500bd9c`
  (`VITE_RUNTIME_BACKEND=nexari`, puerto 5173, strictPort), commit base
  `288e2332`. Prompt `NEXARI-E2E-20261111-E1` (React+Vite+contador) con
  `promptId=optimized`, provider Ollama, modelo `qwen3:4b-64k`,
  `isDeveloperMode=true`.
- **Hallazgo de configuración (trailing-slash)**: `baseUrl` del provider
  Ollama con barra final (`http://localhost:11434/`) rompe la carga de
  modelos dinámicos — el request redirige con 307 sin cabeceras CORS y el
  navegador bloquea la respuesta. Con `baseUrl` SIN barra final
  (`http://localhost:11434`) la carga de modelos funciona (3 modelos
  dinámicos cacheados para Ollama). Registrado como requisito de setup.
- Resultado de la corrida: el chat crea `/chat/15`, fase "Analysing
  Request" y después queda clavada en "Determining Files to Read" >12 min.
  El log del dev server muestra **Ollama HTTP 400 "Token Limit
  Exceeded"**: `ollama api/ps` reporta `context_length: 32768` pese a que
  el modelo derivado fue creado con `num_ctx 65536` (Ollama cargó el
  modelo a 32K). El prompt optimizado (~28K tokens) + historial vuelve a
  exceder el contexto. `stream-recovery` reintenta 2 veces con timeouts y
  llega a "Max retries reached".
- El workbench NUNCA montó: 0 iframes de preview, 0 artifacts, sin
  terminal visible. Evidencia: captura de estado DOM de `/chat/15` +
  log del dev server (sesión `proc_5edd81aa24f9`). Único intento de
  navegador permitido consumido; segundo intento no ejecutado por estar
  el bloqueo en el entorno (contexto Ollama), no en la UI.
- Registro de tareas con lo observado:
  - 10.2: **FAIL** — no se obtuvo completion real; la generación se
    detuvo por el 400 de Ollama antes de emitir contenido incremental.
  - 10.3–10.7: **NO-VERIFICABLE-E2E** — sin workbench montado no hay
    guest, terminal ni iframe donde inspeccionar.
  - 11.1–11.6: **NO-VERIFICABLE-E2E** — las pruebas requieren
    ActionRunner y WorkbenchStore reales con un artefacto vivo; no se
    alcanzó ese estado.
  - Ninguno de estos checkboxes se marca como completado.
- Desbloqueo propuesto: garantizar `num_ctx` efectivo ≥ 64K
  (verificar con `ollama show qwen3:4b-64k | grep context_length` tras
  recrear el modelo, o pasar `num_ctx` en `options` de `/api/chat`) y
  relanzar el E2E. Detalle en
  `nexari-rework-evidence-T06-T10-parcial.md` (worktree APP, commit
  `ddc84d2a`).

- [ ] 12.1 Capturar tráfico desde antes de navegar hasta terminar T10/T11.

La captura debe incluir:

- documento principal;
- iframes;
- dedicated/shared workers;
- Service Worker;
- solicitudes fallidas y bloqueadas;
- redirecciones;
- WebSockets;
- recursos servidos desde caché.

Usar captura del navegador que incluya esos targets y, para afirmar
100% local, evidencia del tráfico del servidor de aplicación/proveedor
local que no sea visible en la pestaña.

No aceptar como única evidencia:
performance.getEntriesByType('resource') del documento principal.

Si la herramienta no permite observar workers o Service Worker,
registrar SIN-COBERTURA de red; no declarar cero tráfico.

- [ ] 12.2 Evaluar destinos.

Rechazar hostnames iguales o subdominios de, como mínimo:

- stackblitz.com
- stackblitz.io
- stackblitz.net
- staticblitz.com
- webcontainer.io
- webcontainer-api.io
- bolt.new

Las comparaciones se hacen sobre hostname parseado, no por búsqueda
arbitraria de subcadenas en una URL.

Esta lista es una defensa mínima. Para el cierre 100% local, la regla
decisiva es una allowlist exacta de orígenes locales declarados antes de
la ejecución: host, preview, modelo y repositorio/cache local, si aplica.

Un origen externo no declarado falla el gate de localidad aunque no
aparezca en la lista de dominios prohibidos.

Los intentos bloqueados cuentan como intentos y fallan el gate
“cero dominios StackBlitz”. Bloquearlos no demuestra ausencia de uso.

Los recursos blob: o data: requieren procedencia local acreditada; su
esquema no basta para demostrarla.

Aceptación:

- Cero destinos StackBlitz en toda la captura.
- Cero carga del SDK/runtime StackBlitz en el perfil Nexari.
- Cero dependencias de red externas para el E2E 100% local.
- Sin proxy local que oculte ejecución o adquisición remota no declarada.
- La interacción del iframe sigue funcionando bajo esas condiciones.

- [ ] 12.3 Validar la consolidación documental.

Los únicos documentos normativos nuevos son:

- add-replace-stackblitz/proposal.md
- add-replace-stackblitz/specs/stackblitz-replacement/spec.md
- add-replace-stackblitz/tasks.md

Aceptación documental:

- Los tres cambios anteriores quedan identificados como sustituidos.
- Todos los requisitos nuevos están bajo ADDED Requirements.
- Cada escenario contiene WHEN/THEN e identifica su verificación.
- Cada escenario con navegador está marcado NO-VERIFICABLE-E2E mientras
  no exista evidencia de ejecución.
- No se conserva “backend StackBlitz sin regresión” como criterio de
  cierre del perfil de sustitución.
- La evidencia histórica no se elimina ni se convierte retroactivamente
  en evidencia del checkout actual.

El comando existente del repositorio de specs:

```sh
npm run check:openspec
```

solo comprueba una lista fija de artefactos anteriores. Un código 0 de
ese script NO valida este nuevo change ni sus escenarios. La revisión
estructural anterior sigue siendo obligatoria.

- [ ] 12.4 Emitir la matriz final.

Formato:

| Escenario | Evidencia | Estado | Observación |
|---|---|---|---|
| S01…S26 | comando/test/captura identificable | estado | límite o resultado |

Cierre exacto:

- Todos los escenarios obligatorios acreditados.
- Gates de tests y typecheck en PASS.
- S10 sin resolución desde process.exit.
- Terminal de acciones realmente visible.
- UI de preview respetando readiness.
- Generación real íntegra y streaming observado.
- Vite ready, server-ready e interacción del iframe en la misma ejecución.
- Cola recuperada después de rechazo.
- Cancelación/reintento y ciclo de preview acreditados.
- Captura completa con cero dominios StackBlitz.
- Perfil 100% local satisfecho.
- Ningún NO-VERIFICABLE-E2E, SIN-COBERTURA o NO-EVALUABLE-ENTORNO pendiente.

Si falta navegador vivo, el resultado final será:
“Contrato consolidado; aceptación E2E pendiente”.
Nunca “implementación verificada” ni “cambio cerrado”.

### 12.4.a — Matriz S01–S26 (ejecución 2026-11-11)

Evidencia base: rama `hermes-subagent/subagent-sa-0-7500bd9c`, commit
`288e2332`; suite completa `pnpm test` 268/268 PASS y `pnpm run typecheck`
PASS sobre ese checkout; sin navegador vivo en la sesión.

| Escenario | Evidencia | Estado | Observación |
|---|---|---|---|
| S01 | runtime-selector/browser-runtime/composition specs dentro de suite 268 PASS | PASS (estructural) | fallback StackBlitz ausente en perfil nexari |
| S02 | — | NO-VERIFICABLE-E2E | requiere captura de red con navegador vivo |
| S03 | vivari-guest-factory/nexari-app-boot/nexari-runtime specs PASS | PASS (test) | boot devuelve guest adaptado |
| S04 | nexari-runtime-facade spec PASS | PASS (test) | sh -c con stdout/stderr/exit |
| S05 | nexari-action-shell spec PASS (estructura I→W→R) | PASS (estructura) | pipeline completo limpio: NO-VERIFICABLE-E2E |
| S06 | nexari-action-shell spec PASS | PASS (test) | casos y flags conservados |
| S07 | nexari-terminal/action-runner specs PASS | PASS (test) | presentación visual: NO-VERIFICABLE-E2E |
| S08 | — | NO-VERIFICABLE-E2E | requiere servidor vivo en guest |
| S09 | previews spec PASS (port:open ready=false) | PASS (store) | transporte real: NO-VERIFICABLE-E2E |
| S10 | gate de lectura T05 (rama `process.exit.then` llama settle) | FAIL (lectura) | requiere eliminar esa ruta; no re-verificada en esta sesión |
| S11 | — | NO-VERIFICABLE-E2E | progreso visible requiere navegador |
| S12 | — | NO-VERIFICABLE-E2E | separación manual/acción requiere navegador |
| S13 | nexari-action-shell spec PASS (fallo detiene pipeline) | PASS (test) | — |
| S14 | then(callback, callback) acreditado; cola completa: WorkbenchStore no probado entero | PASS (estructural) | verificación E2E pendiente (T11.2) |
| S15 | specs adapter PASS; cancelación real | NO-VERIFICABLE-E2E | — |
| S16 | — | NO-VERIFICABLE-E2E | reintento requiere navegador |
| S17 | optimized.test.ts PASS (guía condicional presente) | PASS (textual) | promptId efectivo en solicitud: NO-EJECUTADO |
| S18 | — | NO-VERIFICABLE-E2E | manifiesto íntegro en guest requiere E2E |
| S19 | capture spec: stream real replay acredita callbacks tras el fix | PASS (parser) | streaming E2E observable: NO-VERIFICABLE-E2E |
| S20 | nexari-runtime-facade/previews specs PASS | PASS (test) | — |
| S21 | lectura T08: Preview.tsx no consulta `ready` | FAIL (estructural) | UI exige cambio en Preview.tsx |
| S22 | previews spec PASS (server-ready sin duplicar) | PASS (test) | — |
| S23 | specs de store PASS; 404/500/colgado reales | NO-VERIFICABLE-E2E | — |
| S24 | — | NO-VERIFICABLE-E2E | ciclo de preview requiere navegador |
| S25 | generación real bloqueada por parser — FIX aplicado y acreditado (commit 288e2332, capture spec PASS) | NO-VERIFICABLE-E2E | el bloqueo "stream llega y no renderiza" está resuelto a nivel parser; falta E2E completo |
| S26 | T01 no ejecutado en esta sesión; dev server obsoleto (PID 38560, :5173) eliminado y puerto libre verificado | NO-EVALUADO | procedencia completa requiere re-ejecutar T01 |

Veredicto: “Contrato consolidado; aceptación E2E pendiente”. El gate de
parser (S19/S25) quedó acreditado con el stream real capturado; ningún
estado se promovió sin evidencia directa.

````
