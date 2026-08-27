# Security boundaries

Nexari executes guest code in the browser. Milestone 0.1 is an internal proof environment, not multi-tenant hosting.

- Cross-origin isolation is mandatory and fails closed.
- Service Worker assets and preview routing must be same-origin and scoped deliberately.
- No credential forwarding, remote runtime fallback, or external code execution service is allowed.
- Do not add secrets, user persistence, telemetry, deployment credentials, or auth to this repository.
- Resource quotas and hostile-guest mitigation require a separate spike before broader exposure.

Report issues privately to the project owner; do not publish exploitation instructions or test against third-party systems.
