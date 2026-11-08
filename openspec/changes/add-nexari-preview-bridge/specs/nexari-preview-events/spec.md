# Delta: nexari preview bridge

## ADDED Requirements

### Requirement: El runtime nexari emite server-ready cuando el server in-VM responde

La superficie nexari SHALL emitir un evento `server-ready(port, baseUrl)` solo cuando una petición HTTP real al server in-VM es respondida (el bind de puerto NO cuenta como ready, según el design de Vivari).

#### Scenario: vite arranca y responde

- **WHEN** el pipeline wasm-safe inicia `npm run dev` y el server responde su primera petición HTTP
- **THEN** el surface emite `server-ready` con el port y una baseUrl utilizable por el navegador.

#### Scenario: server nunca responde

- **WHEN** el proceso de dev falla o no responde antes del timeout
- **THEN** ningún evento `server-ready` se emite y el Preview conserva su estado "No preview available".

### Requirement: PreviewsStore consume la superficie genérica

`PreviewsStore` SHALL suscribirse a server-ready a través de la superficie de runtime (nuevo selector o campo opcional en las superficies existentes), manteniendo el comportamiento stackblitz intacto.

#### Scenario: backend nexari muestra la app en el Preview

- **WHEN** el backend es nexari y llega `server-ready`
- **THEN** el iframe del Preview carga la baseUrl y renderiza la app generada.

#### Scenario: la disponibilidad del preview depende de readiness HTTP, no del bind

- **WHEN** el server in-VM abre el puerto (`port: open`) pero aún no responde HTTP
- **THEN** la entrada puede registrarse con `ready=false` y el Preview conserva "No preview available"; solo `server-ready` marca `ready=true` e inserta la entrada si no existe.

#### Scenario: desuscripción corta las entregas

- **WHEN** un consumidor se desuscribe vía la función retornada por la superficie nexari
- **THEN** el listener no recibe emisiones posteriores, verificado a través de la fachada real (no de un fake).

#### Scenario: backend stackblitz sin regresión

- **WHEN** el backend es stackblitz
- **THEN** el flujo de previews es idéntico al actual (mismo código consumido).

### Requirement: El mecanismo de transporte se resuelve por spike antes de fijar interfaz

La primera tarea SHALL ser un spike sobre el SDK vendido (`@nexari/vivari-adapter`, assets `__vv-preview-boot.html`, port registry) que documente: qué expone el SDK para URL de preview y si el browser alcanza el server in-VM directamente o vía proxy del host. La interfaz del surface se define en función del resultado, no de suposiciones.

#### Scenario: spike documenta el transporte

- **WHEN** el spike concluye
- **THEN** existe una nota (en el commit o PR) con el mecanismo elegido, evidencia (respuestas HTTP observadas) y la firma exacta del nuevo selector/field de superficie.
