# Runtime isolation specification

The runtime SHALL reject boot with `ISOLATION_REQUIRED` when cross-origin isolation or `SharedArrayBuffer` is unavailable. It SHALL launch no guest worker/process on that path.

Each instance SHALL own an ID, filesystem namespace and port namespace. Teardown SHALL be idempotent, close guest processes and prevent operations other than a repeated teardown. Unsupported capabilities SHALL be reported explicitly.
