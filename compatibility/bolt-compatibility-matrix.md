# Bolt.DIY → Nexari compatibility matrix

**Bolt analysis input:** [stackblitz-labs/bolt.diy@2e254ac19a696394030601bc602f54945b12bfc4](https://github.com/stackblitz-labs/bolt.diy/tree/2e254ac19a696394030601bc602f54945b12bfc4) (read-only).

A row is not compatible until its named browser test passes against Nexari's owned fork. All rows are intentionally unknown in the provenance milestone; no compatibility claim is made yet.

| Requirement | Priority | Behavior | Bolt evidence | Required browser proof | Current status |
|---|---|---|---|---|---|
| BOLT-WC-001 | must-have | boot: WebContainer.boot accepts coep credentialless, workdirName and forwardPreviewErrors. | app/lib/webcontainer/index.ts:26-30 | e2e/boot-options.spec.ts | unknown |
| BOLT-WC-002 | must-have | preview-diagnostics: Runtime accepts preview script injection and emits preview diagnostics to the host. | app/lib/webcontainer/index.ts:37-57 | e2e/preview-diagnostics.spec.ts | unknown |
| BOLT-WC-003 | must-have | filesystem: Filesystem supports readFile, writeFile, mkdir, readdir and rm with text and binary payloads. | app/lib/stores/files.ts:554-888; app/lib/hooks/useGit.ts:191-311 | e2e/filesystem-crud.spec.ts | unknown |
| BOLT-WC-004 | must-have | workdir: Runtime exposes a stable workdir used for path translation by actions, persistence and git. | app/lib/runtime/action-runner.ts:317-466; app/lib/hooks/useGit.ts:87-138 | e2e/workdir.spec.ts | unknown |
| BOLT-WC-005 | must-have | spawn: Runtime spawns node, npm and shell-like guest processes with arguments, cwd/env and observable exit. | app/lib/runtime/action-runner.ts:395; app/utils/shell.ts:7-89 | e2e/process-spawn.spec.ts | unknown |
| BOLT-WC-006 | must-have | terminal: Interactive shell process exposes input, merged output, terminal cols/rows, resize and kill. | app/utils/shell.ts:11-87; app/lib/stores/terminal.ts:50-61 | e2e/interactive-terminal.spec.ts | unknown |
| BOLT-WC-007 | must-have | preview-events: Runtime emits raw port state and server-ready only after a usable preview response. | app/lib/stores/previews.ts:169-208 | e2e/preview-readiness.spec.ts | unknown |
| BOLT-WC-008 | must-have | preview-routing: Host can attach a preview and cleanly detach stale routes on teardown. | app/components/workbench/Preview.tsx:380-399; app/lib/stores/previews.ts:211-254 | e2e/preview-lifecycle.spec.ts | unknown |
| BOLT-WC-009 | must-have | watching: Runtime exposes a path-watch capability suitable for host file synchronisation. | app/lib/stores/files.ts:593-605 | e2e/filesystem-watch.spec.ts | unknown |
| BOLT-WC-010 | should-have | search: Runtime supports host-scoped text search or reports it unsupported explicitly. | app/components/workbench/Search.tsx:17-23,129 | e2e/text-search-capability.spec.ts | unknown |
| BOLT-WC-011 | must-have | export: Runtime can recursively enumerate project files for Git and deployment flows. | app/components/deploy/GitHubDeploy.client.tsx:86-149; app/components/deploy/NetlifyDeploy.client.tsx:84-149 | e2e/project-export.spec.ts | unknown |
| BOLT-WC-012 | must-have | native-limits: Native binaries, permission changes and symlinks are disclosed rather than implied. | app/lib/hooks/useGit.ts:358-374; app/lib/common/prompts/prompts.ts:18-41 | e2e/unsupported-capabilities.spec.ts | unknown |
| BOLT-WC-013 | must-have | preview-url: Preview URL is host-configurable and not assumed to use StackBlitz wildcard domains. | app/routes/webcontainer.preview.$id.tsx:66-88; app/components/workbench/Preview.tsx:380-399 | e2e/self-hosted-preview-url.spec.ts | unknown |
| BOLT-WC-014 | must-have | isolation: Missing required isolation must fail closed before a guest process launches. | Nexari requirement derived from public Vivari baseline and browser platform constraint | e2e/isolation-negative.spec.ts | unknown |
| BOLT-WC-015 | must-have | cancellation: A package-manager process must expose kill/cancellation and terminal recovery after a stalled command. | Bolt issue #2043; app/lib/stores/terminal.ts:50-61 | e2e/process-cancellation.spec.ts | unknown |
| BOLT-WC-016 | must-have | preview-recovery: Preview state must reflect a fresh server response and cleanly recover from stale routes. | Bolt issue #2140; app/lib/stores/previews.ts:169-208 | e2e/preview-recovery.spec.ts | unknown |
| BOLT-WC-017 | must-have | browser-support: Unsupported browser isolation states must be detectable and give a typed failure, not a blank preview. | Bolt issue #2070; app/lib/webcontainer/index.ts:21-30 | e2e/browser-capability-negative.spec.ts | unknown |

## Gate

No future Bolt integration can select Nexari until every must-have row is proven by its browser proof or the Human Owner records an explicit limitation decision.
