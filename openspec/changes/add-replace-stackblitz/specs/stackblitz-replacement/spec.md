# Capability: stackblitz-replacement

## Verification Convention

Los identificadores T01–T12 remiten a tasks.md.

Estados de evidencia:

- PASS: verificación ejecutada y criterio satisfecho.
- FAIL: evidencia válida contradice el requisito.
- NO-EJECUTADO: comando disponible pero no ejecutado.
- SIN-COBERTURA: los tests existentes no prueban la propiedad exigida.
- NO-VERIFICABLE-E2E: depende del navegador vivo y no se ha observado.
- NO-EVALUABLE-ENTORNO: checkout, servidor, assets o sesión no corresponden
  al entorno declarado.

La lectura de código acredita estructura y comportamiento deducible;
no acredita generación real, visibilidad de terminal, transporte HTTP del
browser ni renderizado.

Un PASS de suite no acredita escenarios que la suite no cubre.

## ADDED Requirements

### Requirement: El perfil aceptado ejecuta Nexari localmente sin StackBlitz

El sistema SHALL seleccionar Nexari mediante configuración explícita,
ejecutar el proyecto dentro del navegador y fallar de forma visible si
Nexari no puede arrancar, sin recurrir a StackBlitz.

#### Scenario: S01 Selección efectiva de Nexari

- **WHEN** la aplicación arranca con VITE_RUNTIME_BACKEND=nexari.
- **THEN** runtimeBackend es nexari, la promesa del runtime resuelve a la
  fachada Nexari en estado ready y sus consumidores usan esa superficie.
- **AND** un fallo de boot o de selección no dispara un boot StackBlitz.
- Verificación: T02; runtime-selector.ts, browser-runtime.ts y los
  selectores de acciones, archivos y previews.

#### Scenario: S02 Ejecución íntegramente local y sin dominios StackBlitz

- **WHEN** se ejecuta el recorrido completo de aceptación.
- **THEN** los procesos del proyecto y su filesystem pertenecen al guest
  del navegador, y SDK, workers, WASM, Service Worker y preview proceden
  de los recursos locales registrados.
- **AND** ninguna solicitud, redirección, WebSocket o intento bloqueado
  alcanza dominios StackBlitz o recursos de su runtime.
- **AND** el E2E declarado 100% local tampoco requiere proveedor LLM,
  registry, CDN o proxy remoto.
- Verificación: T09, T10 y T12.
- Estado sin navegador vivo: NO-VERIFICABLE-E2E.

### Requirement: Boot y procesos respetan las superficies reales

El sistema SHALL distinguir el proceso guest del proceso de fachada.
La factory que recibe createNexariRuntime SHALL resolver con un guest
utilizable, no con el resultado void de guest.boot().

#### Scenario: S03 Boot devuelve el guest adaptado

- **WHEN** finaliza el boot de Vivari.
- **THEN** la factory espera guest.boot() y devuelve el guest adaptado con
  fs, spawn y teardown; incorpora onGuestEvent cuando está disponible.
- **AND** el adapter pasa a ready después de recibir ese guest.
- Verificación: T03; vivari-guest-factory.ts y nexari-runtime.ts.

#### Scenario: S04 Comandos finitos usan sh -c y esperan las tres terminaciones

- **WHEN** runActionCommand recibe un comando finito.
- **THEN** invoca guest.spawn('sh', ['-c', command], ...).
- **AND** consume stdout y stderr y espera exit antes de devolver
  {stdout, stderr, exitCode}.
- **AND** el proceso guest ofrece input, stdout, stderr, exit y kill.
- **AND** output combinado corresponde a la fachada; no se exige output
  en un fixture que representa un proceso guest.
- Verificación: T03; nexari-runtime.spec.ts y
  nexari-runtime-facade.spec.ts.

### Requirement: La reescritura WASM es determinista y tiene alcance explícito

rewriteWasmSafeCommand SHALL ser una función pura que devuelve string[]
ordenado o null. El contrato comprende las formas de la tabla siguiente;
no promete interpretar shell general.

Definiciones:

I = npm install --ignore-scripts

W = npm install --no-save --ignore-scripts esbuild@0.28.2 @rollup/wasm-node

R = node -e "const fs=require('fs'); fs.rmSync('node_modules/rollup',{recursive:true,force:true}); fs.cpSync('node_modules/@rollup/wasm-node','node_modules/rollup',{recursive:true})"

La preparación es [I, W, R].

| Entrada | Resultado exigido |
|---|---|
| npm install | [I, W, R] |
| npm ci | [I, W, R] |
| npm install --legacy-peer-deps | [I, W, R] |
| npm run dev | [I, W, R, npm run dev] |
| npm run build | [I, W, R, npm run build] |
| npm run preview | [I, W, R, npm run preview] |
| npm install && npm run dev | [I, W, R, npm run dev] |
| npm run build && npm run preview | [I, W, R, npm run build, npm run preview] |
| npm run dev -- --host 0.0.0.0 | [I, W, R, npm run dev -- --host 0.0.0.0] |
| npm install vite@7.1.0 | [npm install --ignore-scripts --no-save vite@7.1.0, W, R] |
| npm install lodash axios | [npm install --ignore-scripts --no-save lodash axios] |
| pnpm install | [I, W, R] |
| yarn install && yarn run dev | [I, W, R, npm run dev] |
| yarn dev | null |
| npm test | null |
| ls -la | null |
| cat package.json | null |
| npm install&&npm run dev | null |

Limitaciones explícitas:

- npm ci se normaliza; no se promete conservar su semántica de lockfile.
- --legacy-peer-deps se descarta deliberadamente en el caso especificado.
- Los ejemplos de instalación de paquetes usan --no-save; no prometen
  modificar dependencies/devDependencies.
- La instalación explícita de esbuild para este perfil fija 0.28.2.
- Las cadenas admitidas usan el separador " && ".
- Los ejemplos admitidos colocan el servidor persistente al final.
- No se generaliza a quotes, operadores adicionales, flags con valores,
  versiones arbitrarias de esbuild ni cualquier forma pnpm/yarn.
- null significa ejecutar el comando original intacto; no significa que
  ese comando sea compatible con el guest.

#### Scenario: S05 Pipeline completo desde dependencias limpias

- **WHEN** una acción ejecuta npm install && npm run dev en un proyecto
  sin node_modules.
- **THEN** ejecuta I, W y R en ese orden y después lanza npm run dev.
- **AND** no ejecuta el comando compuesto original.
- **AND** W crea el origen requerido por R sin depender de instalaciones
  de una ejecución anterior.
- Verificación del orden: T04.
- Verificación con guest real, con y sin overrides: T10.
- Estado de la ejecución real sin browser: NO-VERIFICABLE-E2E.

#### Scenario: S06 Conservación de operaciones y argumentos admitidos

- **WHEN** se evalúan las entradas de la tabla.
- **THEN** las salidas coinciden exactamente con la tabla.
- **AND** build no desaparece de build && preview, vite@7.1.0 conserva su
  versión y los argumentos tras -- permanecen en el paso final.
- Verificación: T04. Los casos sin aserción existente requieren inspección
  explícita; no quedan cubiertos por el nombre de otro test.

#### Scenario: S07 Passthrough y terminal manual

- **WHEN** la reescritura devuelve null.
- **THEN** runActionCommand recibe el string original, sin normalizarlo.
- **WHEN** el usuario introduce un comando en la sesión interactiva.
- **THEN** ese comando sigue la sesión interactiva y no pasa por
  rewriteWasmSafeCommand.
- Verificación: T04 y T06; nexari-action-shell.ts, nexari-terminal.ts y
  terminal.ts.

### Requirement: Los servidores persistentes no resuelven por process.exit

El paso de servidor SHALL ejecutarse mediante spawn separado del action
lane finito. Su promesa SHALL poder resolver mientras el proceso continúa
vivo. NUNCA SHALL resolver desde process.exit.

Se distinguen cuatro señales existentes:

1. server-ready: evidencia de disponibilidad HTTP del SDK.
2. port:open: aceptación del arranque, sin acreditar disponibilidad HTTP.
3. Output reconocido como arranque: aceptación, sin acreditar render.
4. Timeout de 30 000 ms: liberación del paso, sin acreditar disponibilidad.

El timeout empieza al entrar en runServerStep; no limita la instalación
completa. Un resultado exitCode=0 producido por estas señales es resultado
de la acción, no el código de salida observado del servidor.

#### Scenario: S08 El servidor vivo permite finalizar la acción

- **WHEN** los pasos finitos terminan correctamente y el proceso de
  npm run dev mantiene exit pendiente.
- **THEN** se suscriben los eventos antes del spawn.
- **AND** server-ready resuelve el paso sin esperar exit ni cerrar los
  streams del servidor como condición de éxito.
- **AND** npm run dev no pasa por runActionCommand.
- **AND** la acción puede alcanzar complete y el servidor sigue sirviendo.
- Verificación de la promesa: T05.
- Verificación de acción y servidor reales: T10,
  NO-VERIFICABLE-E2E sin navegador.

#### Scenario: S09 Puerto, output y timeout no fabrican readiness

- **WHEN** el paso se acepta por port:open, output reconocido o timeout.
- **THEN** no se sintetiza server-ready ni se convierte un preview nuevo
  en ready.
- **AND** sin una señal anterior, el fallback de 30 000 ms libera el paso
  cuando se ejecuta su temporizador.
- **AND** la llegada posterior de otra señal no produce una segunda
  resolución de la misma promesa.
- Verificación: T05 y T08; inspección de runServerStep y PreviewsStore.

#### Scenario: S10 Exit no es una señal de finalización del servidor

- **WHEN** process.exit resuelve, con código 0 o no cero, antes de las
  señales admitidas del paso de servidor.
- **THEN** ese hecho no llama a resolve ni a settle del paso.
- **AND** un fixture con exit ya resuelto no acredita el escenario S08.
- Verificación: T05, inspección de todas las rutas hacia settle.
- Evidencia inicial: la rama process.exit.then actual contradice este
  escenario; no se considera aprobado por los tests de readiness.

### Requirement: El output de acciones llega a la terminal visible

El sistema SHALL presentar el output del action lane en la terminal visible
correspondiente a las acciones de bolt.diy, incluyendo comandos efectivos,
stdout y stderr. No basta con devolver un string o escribir en la consola
del navegador.

La sesión interactiva SHALL seguir siendo una vía independiente.

#### Scenario: S11 Progreso y diagnóstico visibles del pipeline

- **WHEN** una acción ejecuta el pipeline WASM.
- **THEN** la terminal visible identifica I, W, R y el comando final real.
- **AND** el output completado de los pasos finitos se presenta sin esperar
  la terminación del servidor persistente.
- **AND** el output disponible del arranque se presenta en esa terminal.
- **AND** si un paso falla, se muestran su diagnóstico y código.
- Verificación de composición: T04.
- Verificación de conexión y presentación real: T06 y T10.
- Estado de visibilidad sin browser: NO-VERIFICABLE-E2E.

#### Scenario: S12 La terminal manual no suplanta evidencia de acciones

- **WHEN** se ejecuta una acción con un marcador exclusivo de stdout y
  otro de stderr, sin escribirlos en la terminal manual.
- **THEN** ambos marcadores aparecen en la terminal visible de acciones.
- **AND** un comando posterior escrito manualmente funciona mediante su
  propia sesión, sin reproducir ni ejecutar otra vez la acción.
- Verificación: T06 y T11.
- Estado sin browser: NO-VERIFICABLE-E2E.

### Requirement: Los fallos no contaminan pasos posteriores ni la cola

El sistema SHALL detener un pipeline al primer paso finito fallido,
conservar su código y permitir ejecutar trabajo posterior independiente.

#### Scenario: S13 El primer fallo detiene el pipeline

- **WHEN** W termina con exitCode=37 y stderr="boom".
- **THEN** R y el servidor no se ejecutan.
- **AND** el resultado conserva exitCode=37 y el diagnóstico.
- Verificación: T04; test existente
  "stops at the first failing step and returns that step exit code".

#### Scenario: S14 La cola sobrevive un rechazo

- **WHEN** una tarea A añadida a WorkbenchStore rechaza y después se
  encolan B y C.
- **THEN** B y C se ejecutan una sola vez y en orden.
- **AND** la ejecución de B y C no depende de recargar la página o crear
  otro WorkbenchStore.
- **AND** el fallo de A no se presenta como éxito de A.
- Verificación estructural: T07, addToExecutionQueue.
- Verificación de integración: T11, NO-VERIFICABLE-E2E sin browser.

#### Scenario: S15 Cancelación directa y cancelación desde la acción

- **WHEN** una señal ya abortada llega a executeCommand.
- **THEN** no empieza ningún paso del pipeline.
- **WHEN** se cancela una acción real durante un paso.
- **THEN** la señal alcanza el trabajo activo y no empiezan pasos
  posteriores de ese intento.
- **AND** cancelar el comando no implica por sí mismo teardown ni reboot
  automático del runtime.
- Verificación del adapter: T03 y T04.
- Verificación del recorrido ActionRunner → señal: T07.
- Cancelación desde UI: T11, NO-VERIFICABLE-E2E sin browser.

#### Scenario: S16 Reintento después de interrupción

- **WHEN** se reintenta el pipeline después de interrumpir una instalación
  o el swap.
- **THEN** el reintento vuelve a ejecutar I, W y R antes de arrancar.
- **AND** no depende de un Rollup parcial ni usa el servidor anterior como
  evidencia del nuevo intento.
- **AND** el marcador del nuevo intento aparece en el iframe.
- Verificación: T11.
- Estado sin browser: NO-VERIFICABLE-E2E.

### Requirement: La guía WASM corresponde al prompt usado y al artefacto recibido

El perfil de generación SHALL usar promptId=optimized y exigir el siguiente
bloque a proyectos Vite/Rollup:

"overrides": {
  "esbuild": "^0.28.2",
  "rollup": "npm:@rollup/wasm-node"
}

La versión exacta instalada por W y el rango del manifiesto son evidencias
distintas. No se declara compatible una combinación únicamente porque
contenga este JSON.

#### Scenario: S17 La solicitud usa la guía efectiva

- **WHEN** se inicia la generación de aceptación.
- **THEN** la solicitud selecciona optimized y el prompt construido
  contiene la instrucción WASM condicional.
- **AND** no se atribuye esta propiedad a default, que usa otra función.
- Verificación estática: T09.
- Verificación de la solicitud real: T10,
  NO-VERIFICABLE-E2E sin navegador.

#### Scenario: S18 El manifiesto generado llega íntegro al guest

- **WHEN** finaliza el streaming de una generación React+Vite.
- **THEN** package.json recibido por el guest es JSON válido y contiene
  ambos overrides.
- **AND** los archivos necesarios llegan antes de ejecutar el arranque.
- **AND** el proyecto generado instala y arranca con la secuencia
  especificada.
- Verificación: T10; lectura del guest, acciones y request de generación.
- Estado sin browser: NO-VERIFICABLE-E2E.

#### Scenario: S19 La guía es condicional y el streaming es observable

- **WHEN** se genera un proyecto HTML/CSS/JS sin bundler ni dependencias.
- **THEN** la guía no fuerza package.json, Vite ni overrides.
- **WHEN** se genera el proyecto Vite del E2E.
- **THEN** se observa al menos una actualización de contenido antes de
  finalizar la respuesta y el artefacto final queda completo.
- **AND** no se afirma una mejora o ausencia de regresión de latencia:
  este escenario acredita entrega incremental e integridad.
- Verificación: T09 para la instrucción; T10 para generación y streaming.
- Estado de los resultados generados sin browser:
  NO-VERIFICABLE-E2E.

### Requirement: Las suscripciones sobreviven al boot tardío y se pueden cancelar

La fachada SHALL admitir suscripciones server-ready y port antes de que
exista runtime.on y conectarlas cuando aparezca la lane del guest.

#### Scenario: S20 Suscripción antes de boot y desuscripción efectiva

- **WHEN** se registra un listener antes de completar boot.
- **THEN** recibe eventos posteriores a su conexión con el guest.
- **WHEN** se desuscribe antes de aparecer la lane.
- **THEN** no se registra posteriormente.
- **WHEN** se desuscribe después de conectarse.
- **THEN** invoca el detach real y deja de recibir eventos.
- **AND** estas propiedades se prueban con createNexariBrowserRuntime
  real, no sustituyendo toda la fachada por un fake.
- Verificación: T08; nexari-runtime-facade.spec.ts.

### Requirement: Preview disponible requiere server-ready y transporte real

El sistema SHALL distinguir apertura de puerto, respuesta HTTP y aplicación
funcional. El transporte SHALL corresponder al SDK instalado.

En el SDK inspeccionado, el modo local utiliza Service Worker y rutas
/preview/<port>/; esa ruta no identifica un servidor TCP del host.

El sondeo waitServing inspeccionado acepta respuestas distintas de 502/503,
incluidas 404/500. Por tanto, server-ready no garantiza un documento exitoso
ni módulos funcionales.

#### Scenario: S21 Un bind no hace disponible el preview

- **WHEN** llega port:open sin server-ready para un servidor nuevo.
- **THEN** el store puede registrar el puerto con ready=false.
- **AND** la UI conserva el estado no disponible y no presenta esa entrada
  como una aplicación lista.
- **AND** el timeout de la acción no modifica esta condición.
- Verificación del store: T08.
- Verificación del consumidor: T08, Preview.tsx.
- Verificación visual: T11, NO-VERIFICABLE-E2E sin browser.

#### Scenario: S22 Server-ready inserta o actualiza una sola entrada

- **WHEN** llega server-ready(port, url), con o sin port:open previo.
- **THEN** existe una única entrada para ese puerto, con ready=true y
  baseUrl igual a la URL recibida.
- **AND** repeticiones actualizan esa entrada sin duplicarla.
- Verificación: T08; previews.ts y previews.spec.ts.

#### Scenario: S23 No respuesta, HTTP de error y timeout son distintos

- **WHEN** el servidor abre el puerto pero no responde al sondeo.
- **THEN** no se considera listo por el bind ni por el timeout del shell.
- **WHEN** el SDK emite server-ready después de una respuesta 404/500.
- **THEN** el evento no satisface el gate de render funcional.
- **AND** no se presenta el timeout nominal de waitServing como garantía
  de interrupción de una petición que nunca resuelve.
- Verificación de semántica: T08 y SDK instalado.
- Verificación de transporte y estado visual: T11,
  NO-VERIFICABLE-E2E sin browser.

#### Scenario: S24 Cierre, reapertura y actualización visible

- **WHEN** se cierra un puerto publicado.
- **THEN** el store elimina su entrada y el preview anterior deja de
  representar un servidor disponible.
- **WHEN** se abre otra vez.
- **THEN** debe recibir un nuevo server-ready antes de estar disponible.
- **WHEN** se guarda un cambio de marcador y se pulsa recargar preview.
- **THEN** el iframe muestra el marcador nuevo.
- **AND** pasar este escenario no acredita HMR automático.
- Verificación del store: T08.
- Verificación del ciclo completo: T11,
  NO-VERIFICABLE-E2E sin browser.

### Requirement: El cierre acredita generación hasta render en una ejecución identificable

El cambio SHALL cerrarse mediante evidencia de una misma ejecución,
sin reutilizar readiness, procesos o páginas de intentos anteriores.

#### Scenario: S25 Generación real, Vite ready y render funcional

- **WHEN** se genera el proyecto React+Vite de T10 desde un guest limpio.
- **THEN** se observa el artefacto completo y su manifiesto en el guest.
- **AND** se ejecutan los cuatro pasos efectivos.
- **AND** aparece output de Vite ready correspondiente al intento.
- **AND** llega server-ready con el puerto y URL del intento.
- **AND** la acción finaliza mientras el servidor sigue funcionando.
- **AND** iframe[title="preview"] muestra el marcador único solicitado
  y su botón interactivo actualiza el contador.
- **AND** no hay errores de carga o ejecución que impidan esa interacción.
- **AND** se satisfacen los controles de localidad y red de T12.
- Verificación: T10 y T12.
- Estado sin browser: NO-VERIFICABLE-E2E.

#### Scenario: S26 La evidencia de un servidor obsoleto no se atribuye al checkout

- **WHEN** no coinciden checkout, proceso del host, assets servidos,
  Service Worker o sesión guest con la procedencia registrada.
- **THEN** la ejecución se clasifica NO-EVALUABLE-ENTORNO.
- **AND** no se usa para aprobar ni rechazar el comportamiento del checkout.
- **WHEN** la procedencia coincide y falla una aserción funcional.
- **THEN** se registra FAIL con su evidencia concreta.
- Verificación: T01 y T10.
```

**`openspec/changes/add-replace-stackblitz/tasks.md`**

````markdown
