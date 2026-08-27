# Runtime adapter specification

The system SHALL expose a host-owned `BrowserRuntime` contract with boot, mount, spawn, filesystem, preview attachment, export, teardown, capabilities and typed events.

The runtime factory SHALL accept `backend: 'vivari' | 'stackblitz'`. In milestone 0.1, `stackblitz` SHALL reject with `BACKEND_UNAVAILABLE` without loading external runtime resources. Only the Nexari Vivari adapter MAY import fork-specific types.

Every supported adapter behavior SHALL link a `BOLT-WC-###` requirement and browser proof.
