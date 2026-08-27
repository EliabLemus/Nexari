# Nexari Architecture

```text
Nexari Lab / future host
        │ BrowserRuntime (owned contract)
        ▼
RuntimeFactory ── backend: vivari | stackblitz
        │
        ▼
Nexari Vivari adapter (only future importer of fork SDK)
        │
        ▼
Nexari-owned Vivari fork
  ├─ worker/kernel + SharedArrayBuffer VFS
  ├─ guest Node-style processes
  ├─ virtual HTTP routing
  └─ same-origin Service Worker preview
        │
        ▼
Preview iframe
```

## Isolation

Nexari requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Boot must fail with a typed `ISOLATION_REQUIRED` error if the page cannot use `SharedArrayBuffer`; it must not silently start a degraded guest.

Each runtime receives a unique ID, filesystem namespace, and port ownership. Teardown must terminate guest processes, unregister its routing state, detach preview bindings, and be idempotent.

## Compatibility method

The source of truth is the compatibility matrix. A behavior becomes supported only after it has:

1. a `BOLT-WC-###` requirement with a host source location or public API source;
2. a clean-room observable statement;
3. a browser-facing regression test against Nexari's fork; and
4. a recorded Judge result.

Open Bolt.DIY issues are evidence to triage, not automatically features. A report can be `NEXARI-REQUIREMENT`, `BOLT-ONLY`, `DUPLICATE`, `NOT-A-RUNTIME-ISSUE`, or `NEEDS-OWNER-DECISION`.

## Explicit limits

Nexari will disclose rather than emulate: native Node addons, Docker, SSH, ELF binaries, non-loopback TCP/UDP, and arbitrary remote sockets. It does not include v86.
