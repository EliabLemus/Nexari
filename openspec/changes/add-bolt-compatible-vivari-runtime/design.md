# Design

## Ownership

`Lab Host → RuntimeFactory → BrowserRuntime → Nexari Vivari adapter → owned Vivari fork → Worker/VFS/Service Worker → Preview iframe`.

Only the future adapter package imports the fork SDK. A host selects `vivari` or `stackblitz`; milestone 0.1 exposes `BACKEND_UNAVAILABLE` for StackBlitz rather than importing it.

## Lifecycle and errors

Lifecycle: `created → booting → ready → tearing_down → terminated`. `teardown()` is idempotent; all other operations after termination reject with `TORN_DOWN`. Typed error vocabulary includes `ISOLATION_REQUIRED`, `BACKEND_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY`, `BOOT_FAILED`, `TORN_DOWN`, and `COMMAND_NOT_FOUND`.

## Browser isolation and preview

The host must serve COOP `same-origin`, COEP `require-corp`, and a same-origin Service Worker permitted to use the required preview scope. `server-ready` means an in-VM server has answered a request; raw port bind is insufficient. A runtime owns a unique filesystem namespace and port registry; teardown removes routes and iframe bindings.

## Issue pipeline

Fetch open Bolt issues, identify runtime candidates, read bodies/comments, classify and deduplicate. Only reproducible contract-relevant reports become `NEXARI-REQUIREMENT`; UI, model, deployment and host-only reports do not change the runtime.

## Persistence

No user persistence by default. Browser E2E uses disposable namespaces and teardown verifies removal.
