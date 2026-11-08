# Change: Replace StackBlitz with Nexari

## Why

bolt.diy necesita ejecutar los proyectos generados mediante Nexari/Vivari
wasm32 dentro del navegador, con recursos locales y sin depender de servicios
o dominios StackBlitz.

Las tres propuestas anteriores fragmentan un único recorrido de producto:

generación → archivos guest → instalación WASM → arranque Vite →
server-ready → iframe → aplicación renderizada.

Además, mezclan evidencias distintas: devolver output no demuestra que la
terminal lo muestre; abrir un puerto no demuestra readiness HTTP; resolver
una acción no demuestra que la aplicación renderice.

Este cambio consolida el contrato y establece un único criterio de cierre.

## What Changes

1. Sustituye como contrato de aceptación activo a:
   - add-wasm-safe-start-pipeline
   - add-wasm-compatible-starter-guidance
   - add-nexari-preview-bridge

2. Define una única capacidad: stackblitz-replacement.

3. Documenta las superficies existentes:
   - Guest: input, stdout, stderr, exit y kill.
   - Adapter action lane: sh -c, captura de stdout/stderr y espera de exit
     para comandos finitos.
   - Facade spawn lane: output combinado y proceso persistente.
   - Boot factory: resuelve con el guest adaptado.
   - Eventos: suscripción tardía y desuscripción efectiva.

4. Fija el pipeline WASM de cuatro pasos para arrancar Vite desde un
   proyecto sin node_modules.

5. Distingue:
   - finalización de la acción;
   - disponibilidad HTTP del servidor;
   - renderizado funcional del iframe.

6. Exige que la terminal visible muestre el output de las acciones.
   La sesión interactiva y el action lane conservan su identidad.

7. Exige que una tarea rechazada no inutilice la cola de ejecución.

8. Acota la guía de generación al prompt realmente seleccionado.
   El perfil de aceptación existente usa promptId=optimized.

9. Establece gates separados para lectura de código, tests existentes y
   navegador vivo, con procedencia suficiente para descartar stale servers.

10. Exige un E2E completo de generación real, Vite ready, server-ready y
    render del iframe, con cero solicitudes a dominios StackBlitz.

## Scope

El perfil que se acepta utiliza explícitamente:

- VITE_RUNTIME_BACKEND=nexari.
- promptId=optimized.
- SDK y assets Nexari/Vivari instalados localmente.
- Ejecución del proyecto en workers del navegador.
- Preview local mediante el transporte del SDK instalado.

La configuración es parte del resultado aceptado: actualmente, omitir
VITE_RUNTIME_BACKEND selecciona StackBlitz. Una ejecución sin la
configuración Nexari explícita no demuestra este cambio.

“100% local” exige que el runtime, filesystem guest, procesos, assets y
preview sean locales. Para declarar además el E2E completo 100% local,
el proveedor de generación y la obtención de dependencias deberán estar
disponibles localmente o previamente aprovisionados, sin solicitudes
externas durante la ejecución medida.

Una ejecución con LLM remoto o descargas externas puede aportar diagnóstico,
pero no satisface el cierre 100% local.

No se exige eliminar menciones históricas, tipos TypeScript o paquetes
inactivos de StackBlitz para demostrar ausencia de uso. Sí se exige que el
perfil aceptado no cargue su runtime ni intente contactar sus dominios.

El alcance funcional del preview comprende primer render, recarga explícita,
actualización visible después de guardar y recargar, y cierre/reapertura.
No se afirma soporte de HMR automático a partir de una prueba de primer
render.

## Existing Implementation

Repositorio de aplicación:
~/Projects/bolt.diy-nexari-main

Archivos principales:

- app/lib/runtime/nexari-action-shell.ts
- app/lib/runtime/nexari-runtime.ts
- app/lib/runtime/nexari-runtime-facade.ts
- app/lib/runtime/vivari-guest-factory.ts
- app/lib/runtime/nexari-app-boot.ts
- app/lib/runtime/browser-runtime.ts
- app/lib/runtime/action-shell-selector.ts
- app/lib/runtime/previews-runtime-selector.ts
- app/lib/runtime/action-runner.ts
- app/lib/stores/workbench.ts
- app/lib/stores/terminal.ts
- app/lib/stores/previews.ts
- app/components/workbench/Preview.tsx
- app/lib/common/prompts/optimized.ts
- app/lib/common/prompt-library.ts
- app/lib/.server/llm/stream-text.ts

Este cambio describe comportamiento y verificación. No contiene una
propuesta de implementación nueva.

## Evidence Baseline

Lectura realizada sobre HEAD de la aplicación:
4bfccf26f5b6f799a0a614f823492157d29d0c63

La revisión ASTRA-SPEC-REVIEW-20261108.md es evidencia histórica:
sus conclusiones deben contrastarse con el checkout evaluado.

Confirmado por lectura actual:

- El pipeline principal contiene instalación, instalación explícita de
  paquetes WASM, swap de Rollup y arranque.
- El servidor se lanza mediante spawn separado de runActionCommand.
- La fachada contiene late-binding y llamada efectiva a detach.
- PreviewsStore diferencia port:open de server-ready.
- WorkbenchStore encadena tareas mediante then(callback, callback).

Discrepancias o límites actuales que impiden afirmar aceptación completa:

1. runServerStep contiene process.exit.then(...) que llama a settle.
   Esto contradice el contrato estricto “NUNCA resolver por process.exit”.

2. El test denominado “terminal output” comprueba el string retornado.
   En los archivos inspeccionados no queda acreditado el transporte de ese
   output hasta la terminal visible de acciones.

3. Preview.tsx selecciona activePreview y renderiza por su existencia;
   no consulta ready. Los tests del store no prueban la espera en la UI.

4. La guía WASM está en optimized; default usa getFineTunedPrompt.

5. ActionRunner no pasa action.abortSignal como cuarto argumento de
   executeCommand en las llamadas inspeccionadas. La cancelación directa
   del adapter no acredita cancelación desde la acción/UI.

6. La regresión final de nexari-action-shell.spec.ts usa un guest sintético
   cuyo exit resuelve a 0. Su nombre no la convierte en E2E ni acredita
   independencia de exit.

Estas observaciones son gates de aceptación, no instrucciones para
implementar cambios dentro de esta propuesta.

## Closure

El cambio se cierra únicamente cuando:

- Todos los escenarios obligatorios tienen evidencia suficiente.
- Los comandos de verificación aplicables terminan con código 0.
- Los fixtures usados respetan las superficies reales.
- El E2E de generación → Vite ready → server-ready → iframe render pasa.
- La ejecución corresponde al checkout y assets registrados.
- No hay solicitudes, intentos bloqueados ni redirecciones a StackBlitz.
- Se satisface el perfil 100% local.
- No quedan escenarios obligatorios NO-VERIFICABLE-E2E o sin cobertura.

La ausencia de navegador vivo produce NO-VERIFICABLE-E2E, nunca PASS.
Una ejecución con servidor o assets de procedencia incorrecta produce
NO-EVALUABLE-ENTORNO y debe repetirse con procedencia válida.
```

**`openspec/changes/add-replace-stackblitz/specs/stackblitz-replacement/spec.md`**

```markdown
