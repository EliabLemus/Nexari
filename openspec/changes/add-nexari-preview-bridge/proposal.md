# Proposal: add-nexari-preview-bridge

## Intent

El dev server ya corre dentro del guest (verificado: Vite v5.4.8 ready), pero el preview del workbench no lo muestra. La causa: `PreviewsStore` consume `webcontainer.on('server-ready', (port, url))` del SDK de StackBlitz; el facade Nexari tiene el lane de eventos `on` y `setPreviewScript` como typed refusals. Este change conecta el server in-VM al iframe del Preview.

## What Changes

- **Nueva** capacidad de eventos en la superficie nexari: el runtime nexari detecta que el server in-VM responde y emite `server-ready` (port, baseUrl) hacia `PreviewsStore`.
- **Modificada** `PreviewsStore`: consumir server-ready desde la superficie genérica (no exclusivamente del WebContainer SDK).
- El mecanismo exacto de exposición de la URL in-guest depende del SDK vendido (`@nexari/vivari-adapter` / assets `__vv-preview-boot.html`): la tarea 1 es un spike acotado que resuelve qué expone el SDK antes de fijar la interfaz del surface.

## Capabilities

- **Nueva**: `nexari-preview-events` — detección de server-ready y URL de preview desde el runtime nexari.
- **Modificada**: previews del workbench — el Preview iframe consume la URL cuando el backend es nexari.

## Impact

- `~/Projects/bolt.diy-nexari-main/app/lib/runtime/` (facade + surface de previews), `app/lib/stores/previews.ts`, `app/components/workbench/Preview.tsx` (solo si el iframe necesita baseUrl nexari).
- Riesgo alto de sobre-diseño: la interfaz del surface se decide DESPUÉS del spike (tarea 1), no antes.
