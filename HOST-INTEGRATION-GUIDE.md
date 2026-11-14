# Host Integration Guide

Requisitos y patrones verificados E2E para cualquier host que use el runtime Nexari
(contract `@nexari/runtime-contract` 0.1.0-dev + adapter `@nexari/vivari-adapter`).
Fuente de verdad: la integración E2E completa en
[`bolt-diy-nexari-runtime`](https://github.com/EliabLemus/bolt-diy-nexari-runtime)
(commits `b4de010`–`657acee`, suite 1001 tests, `hermes verify` green).

## 1. Pin del spawn cwd a la raíz del guest VFS

El kernel de Vivari usa como cwd default el último directorio de demo scaffoldeado
(p. ej. `/react-app`). Un spawn sin cwd explícito corre contra el árbol del demo y no
ve el `package.json` del proyecto generado. **Toda la stack del host debe pasar
`cwd: '/'`** (el guest mapea su workdir a la raíz).

## 2. Servers de larga vida: detached, nunca join-on-exit

Los comandos que levantan servers (`npm run dev`, `python3 -m http.server`) **nunca
terminan**: si el host los corre en una lane de exit-join, esa acción no resuelve
nunca. Los servers deben correr **detached** en una lane separada (server-step) y el
host resuelve mediante los eventos `server-ready` y `port` del guest.

## 3. El `sh` del guest no tiene job control

`&`, `$!`, pipelines con background → error de terminal. El kill de procesos no se
hace desde el shell del guest: el host debe mantener handles del proceso/server
anterior y matarlo desde fuera (teardown o kill directo) antes de arrancar uno nuevo.

## 4. Re-bind de puerto: matar el server stale primero

Si el filesystem del guest se comparte entre sesiones/chats, un server viejo sigue
ocupando el puerto. El host debe guardar el handle del último server estático y
matarlo antes del nuevo bind, o el preview queda sirviendo contenido stale.

## 5. Proyectos plain-HTML: servir estático, no npm

Un guest sin `package.json` no puede correr `npm run dev`. Si el proyecto generado
es HTML puro, inyectar un server estático (`python3 -m http.server <port>`) como
fallback. Verificado: assets servidos por python3 + preview vía `server-ready`.

## 6. Aislamiento (recordatorio)

COOP `same-origin` + COEP `require-corp` son obligatorios (ver `ARCHITECTURE.md`).
Sin `SharedArrayBuffer`, el boot debe fallar con `ISOLATION_REQUIRED`, nunca degradar.

## Referencia de implementación

| Concern | Archivo en bolt-diy-nexari-runtime |
|---|---|
| Facade boot + pin cwd + eventos server-ready/port | `app/lib/runtime/vivari-guest-factory.ts` |
| Server-step lane detached + stale-kill | `app/lib/runtime/nexari-action-shell.ts` |
| Selección de backend fail-closed (default `nexari`) | `app/lib/runtime/runtime-selector.ts` |
| Fallback estático para HTML puro | `app/lib/.server/llm/dev-server-injection.ts` |
