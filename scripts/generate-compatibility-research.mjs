import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourceSnapshot = path.join(root, 'compatibility', 'sources');
const boltCommit = '2e254ac19a696394030601bc602f54945b12bfc4';
const retrievedAt = '2026-08-27T17:04:55Z';
const vivariSha = '9a89ff328b87ad0fb6a180d4401ea418c180cbe7';

const requirements = [
  ['BOLT-WC-001', 'must-have', 'boot', 'WebContainer.boot accepts coep credentialless, workdirName and forwardPreviewErrors.', 'app/lib/webcontainer/index.ts:26-30', 'e2e/boot-options.spec.ts'],
  ['BOLT-WC-002', 'must-have', 'preview-diagnostics', 'Runtime accepts preview script injection and emits preview diagnostics to the host.', 'app/lib/webcontainer/index.ts:37-57', 'e2e/preview-diagnostics.spec.ts'],
  ['BOLT-WC-003', 'must-have', 'filesystem', 'Filesystem supports readFile, writeFile, mkdir, readdir and rm with text and binary payloads.', 'app/lib/stores/files.ts:554-888; app/lib/hooks/useGit.ts:191-311', 'e2e/filesystem-crud.spec.ts'],
  ['BOLT-WC-004', 'must-have', 'workdir', 'Runtime exposes a stable workdir used for path translation by actions, persistence and git.', 'app/lib/runtime/action-runner.ts:317-466; app/lib/hooks/useGit.ts:87-138', 'e2e/workdir.spec.ts'],
  ['BOLT-WC-005', 'must-have', 'spawn', 'Runtime spawns node, npm and shell-like guest processes with arguments, cwd/env and observable exit.', 'app/lib/runtime/action-runner.ts:395; app/utils/shell.ts:7-89', 'e2e/process-spawn.spec.ts'],
  ['BOLT-WC-006', 'must-have', 'terminal', 'Interactive shell process exposes input, merged output, terminal cols/rows, resize and kill.', 'app/utils/shell.ts:11-87; app/lib/stores/terminal.ts:50-61', 'e2e/interactive-terminal.spec.ts'],
  ['BOLT-WC-007', 'must-have', 'preview-events', 'Runtime emits raw port state and server-ready only after a usable preview response.', 'app/lib/stores/previews.ts:169-208', 'e2e/preview-readiness.spec.ts'],
  ['BOLT-WC-008', 'must-have', 'preview-routing', 'Host can attach a preview and cleanly detach stale routes on teardown.', 'app/components/workbench/Preview.tsx:380-399; app/lib/stores/previews.ts:211-254', 'e2e/preview-lifecycle.spec.ts'],
  ['BOLT-WC-009', 'must-have', 'watching', 'Runtime exposes a path-watch capability suitable for host file synchronisation.', 'app/lib/stores/files.ts:593-605', 'e2e/filesystem-watch.spec.ts'],
  ['BOLT-WC-010', 'should-have', 'search', 'Runtime supports host-scoped text search or reports it unsupported explicitly.', 'app/components/workbench/Search.tsx:17-23,129', 'e2e/text-search-capability.spec.ts'],
  ['BOLT-WC-011', 'must-have', 'export', 'Runtime can recursively enumerate project files for Git and deployment flows.', 'app/components/deploy/GitHubDeploy.client.tsx:86-149; app/components/deploy/NetlifyDeploy.client.tsx:84-149', 'e2e/project-export.spec.ts'],
  ['BOLT-WC-012', 'must-have', 'native-limits', 'Native binaries, permission changes and symlinks are disclosed rather than implied.', 'app/lib/hooks/useGit.ts:358-374; app/lib/common/prompts/prompts.ts:18-41', 'e2e/unsupported-capabilities.spec.ts'],
  ['BOLT-WC-013', 'must-have', 'preview-url', 'Preview URL is host-configurable and not assumed to use StackBlitz wildcard domains.', 'app/routes/webcontainer.preview.$id.tsx:66-88; app/components/workbench/Preview.tsx:380-399', 'e2e/self-hosted-preview-url.spec.ts'],
  ['BOLT-WC-014', 'must-have', 'isolation', 'Missing required isolation must fail closed before a guest process launches.', 'Nexari requirement derived from public Vivari baseline and browser platform constraint', 'e2e/isolation-negative.spec.ts'],
  ['BOLT-WC-015', 'must-have', 'cancellation', 'A package-manager process must expose kill/cancellation and terminal recovery after a stalled command.', 'Bolt issue #2043; app/lib/stores/terminal.ts:50-61', 'e2e/process-cancellation.spec.ts'],
  ['BOLT-WC-016', 'must-have', 'preview-recovery', 'Preview state must reflect a fresh server response and cleanly recover from stale routes.', 'Bolt issue #2140; app/lib/stores/previews.ts:169-208', 'e2e/preview-recovery.spec.ts'],
  ['BOLT-WC-017', 'must-have', 'browser-support', 'Unsupported browser isolation states must be detectable and give a typed failure, not a blank preview.', 'Bolt issue #2070; app/lib/webcontainer/index.ts:21-30', 'e2e/browser-capability-negative.spec.ts']
];

const dispositions = new Map([
  [2157, ['NEXARI-REQUIREMENT', 'process-liveness', 'high', ['BOLT-WC-015'], 'Reports npm run dev stuck. Treat as a cancellable long-running-process contract, pending browser reproduction.']],
  [2140, ['NEXARI-REQUIREMENT', 'preview', 'high', ['BOLT-WC-016'], 'Reports preview-generation failure. Requires response-based readiness and teardown proof, not URL-pattern reuse.']],
  [2094, ['NEEDS-OWNER-DECISION', 'performance', 'medium', [], 'High client RAM report lacks a reproducible runtime budget. Track as a future quota/performance spike.']],
  [2079, ['BOLT-ONLY', 'terminal-ui', 'low', [], 'Copy/paste behavior is terminal UI/desktop integration, not a browser-runtime contract.']],
  [2070, ['NEXARI-REQUIREMENT', 'browser-isolation', 'high', ['BOLT-WC-017'], 'Safari/WebContainer load report makes typed unsupported-browser/isolation behavior mandatory; it does not promise Safari support.']],
  [2043, ['NEXARI-REQUIREMENT', 'process-cancellation', 'high', ['BOLT-WC-015'], 'Stalled npm install and non-killable terminal maps to explicit process cancellation and recovery.']],
  [2034, ['NOT-A-RUNTIME-ISSUE', 'tooling-semantic', 'low', [], 'Vite handling of use client is application/toolchain semantics, not runtime infrastructure.']],
  [2022, ['BOLT-ONLY', 'host-file-manifest', 'medium', [], 'Preview works; AI file-selection manifest is Bolt host state, not guest filesystem behavior.']],
  [2009, ['BOLT-ONLY', 'message-parser', 'low', [], 'Stack trace is Bolt enhanced-message parser.']],
  [1888, ['BOLT-ONLY', 'editor-agent', 'low', [], 'AI edit strategy is a host/editor concern.']],
  [1878, ['NEEDS-OWNER-DECISION', 'desktop-io', 'medium', [], 'Windows write EOF has insufficient browser-runtime reproduction; do not redesign streams from one report.']],
  [1853, ['BOLT-ONLY', 'server-dependency', 'low', [], 'Missing package export is host build/dependency resolution.']],
  [1838, ['BOLT-ONLY', 'llm-context', 'low', [], 'Prompt-token limit is model-context handling.']],
  [1825, ['BOLT-ONLY', 'agent-application', 'low', [], 'Model stops committing source actions; no runtime failure demonstrated.']],
  [1824, ['NOT-A-RUNTIME-ISSUE', 'insufficient-report', 'low', [], 'No actionable runtime behavior supplied.']],
  [1781, ['BOLT-ONLY', 'server-tls', 'low', [], 'Production TLS trust is deployment/server configuration.']],
  [1732, ['BOLT-ONLY', 'llm-context', 'low', [], 'Context-window tuning is not guest runtime behavior.']],
  [1720, ['BOLT-ONLY', 'server-config', 'low', [], 'Environment-file loading on Linux server is host deployment configuration.']],
  [1689, ['NEEDS-OWNER-DECISION', 'insufficient-report', 'medium', [], 'No code/diff/preview is too vague to assign to runtime without a reproducible project.']],
  [2194, ['BOLT-ONLY', 'host-build', 'low', [], 'React icon export error is Bolt dependency/build failure.']],
  [2176, ['NOT-A-RUNTIME-ISSUE', 'external-fork-announcement', 'low', [], 'External fork announcement is not an issue report against this runtime target.']],
  [2169, ['NOT-A-RUNTIME-ISSUE', 'remote-hosting', 'low', [], 'Server-side persistent hosting is explicitly outside browser-runtime milestone scope.']],
  [2163, ['NOT-A-RUNTIME-ISSUE', 'empty-epic', 'low', [], 'Issue body contains no concrete runtime requirement.']],
  [2129, ['NOT-A-RUNTIME-ISSUE', 'external-fork-announcement', 'low', [], 'External-fork reference contains no Nexari runtime behavior.']],
  [2095, ['BOLT-ONLY', 'telemetry-deployment', 'low', [], 'Cloudflare/telemetry configuration is host deployment policy.']],
  [2080, ['BOLT-ONLY', 'docker-build', 'low', [], 'Docker image dependency is outside Nexari non-goals.']],
  [2036, ['BOLT-ONLY', 'llm-provider', 'low', [], 'Ollama cloud response validation belongs to provider integration.']]
]);

const sourcePath = path.join(sourceSnapshot, 'bolt-open-runtime-candidates-with-comments.json');
const rawIssues = JSON.parse(await readFile(sourcePath, 'utf8'));
const triaged = rawIssues.issues.map((issue) => {
  const d = dispositions.get(issue.number);
  if (!d) throw new Error(`missing disposition for issue #${issue.number}`);
  const [disposition, category, priority, requirementIds, rationale] = d;
  return {
    number: issue.number, url: issue.url, title: issue.title, state: issue.state,
    retrieved_at: rawIssues.retrieved_at, updated_at: issue.updated_at,
    category, reproducibility: disposition === 'NEXARI-REQUIREMENT' ? 'unverified-report; requires a Nexari browser fixture' : 'not a Nexari runtime reproduction',
    bolt_impact: category, priority, disposition, requirement_ids: requirementIds, rationale,
    source_comments_reviewed: issue.comment_bodies.length
  };
});

if (triaged.length !== rawIssues.runtime_keyword_candidate_count) throw new Error('candidate count mismatch');
const compatibilityDir = path.join(root, 'compatibility');
await mkdir(compatibilityDir, { recursive: true });
const inventory = {
  schema_version: 1, generated_at: retrievedAt,
  source: { repository: 'https://github.com/stackblitz-labs/bolt.diy', commit: boltCommit, access: 'read-only local analysis clone' },
  requirements: requirements.map(([id, priority, category, statement, bolt_source, proof]) => ({ id, priority, category, statement, bolt_source, proof, nexari_status: 'unknown' }))
};
await writeFile(path.join(compatibilityDir, 'bolt-webcontainers-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
await writeFile(path.join(compatibilityDir, 'bolt-open-runtime-issues.json'), JSON.stringify({ schema_version: 1, source_repository: rawIssues.repository, retrieved_at: rawIssues.retrieved_at, open_issue_count: rawIssues.open_issue_count, runtime_keyword_candidate_count: triaged.length, triage: triaged }, null, 2) + '\n');
const publicFiles = [
  ['Quickstart', 'https://webcontainers.io/guides/quickstart', '1.html', 'boot, mount and preview public examples'],
  ['Running Processes', 'https://webcontainers.io/guides/running-processes', '2.html', 'public process/stream lifecycle documentation'],
  ['Configuring Headers', 'https://webcontainers.io/guides/configuring-headers', '4.html', 'public browser isolation/header documentation']
];
const sourceRows = [];
for (const [name, url, local, purpose] of publicFiles) {
  const input = path.join(sourceSnapshot, 'stackblitz-public', local);
  const bytes = await readFile(input);
  sourceRows.push({ name, url, retrieved_at: retrievedAt, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: (await stat(input)).size, allowed_claims: purpose });
}
sourceRows.push({ name: 'Public @webcontainer/api package declaration', url: 'https://www.npmjs.com/package/@webcontainer/api/v/1.6.1-internal.1', retrieved_at: retrievedAt, sha256: null, bytes: null, allowed_claims: 'public package/version and public type/API contract only' });
const ledger = `# StackBlitz public contract ledger\n\nThis is a clean-room source ledger. It permits observable API behavior, documented browser requirements and public package/type declarations. It explicitly forbids proprietary runtime binaries, hidden endpoints, obfuscated bundles and implementation extraction.\n\n| Source | Retrieval | Integrity | Allowed use |\n|---|---|---|---|\n${sourceRows.map((s) => `| [${s.name}](${s.url}) | ${s.retrieved_at} | ${s.sha256 ? `${s.sha256.slice(0, 16)}… (${s.bytes} bytes)` : 'package metadata recorded' } | ${s.allowed_claims} |`).join('\n')}\n\nPublic facts are translated into Nexari requirements only when combined with an observable host need and browser proof. The current Bolt-facing IDs are BOLT-WC-001 through BOLT-WC-017; see bolt-webcontainers-inventory.json.\n`;
await writeFile(path.join(compatibilityDir, 'stackblitz-public-contract-ledger.md'), ledger);
const matrix = `# Bolt.DIY → Nexari compatibility matrix\n\n**Bolt analysis input:** [stackblitz-labs/bolt.diy@${boltCommit}](https://github.com/stackblitz-labs/bolt.diy/tree/${boltCommit}) (read-only).\n\nA row is not compatible until its named browser test passes against Nexari's owned fork. All rows are intentionally unknown in the provenance milestone; no compatibility claim is made yet.\n\n| Requirement | Priority | Behavior | Bolt evidence | Required browser proof | Current status |\n|---|---|---|---|---|---|\n${requirements.map(([id, priority, category, statement, source, proof]) => `| ${id} | ${priority} | ${category}: ${statement} | ${source} | ${proof} | unknown |`).join('\n')}\n\n## Gate\n\nNo future Bolt integration can select Nexari until every must-have row is proven by its browser proof or the Human Owner records an explicit limitation decision.\n`;
await writeFile(path.join(compatibilityDir, 'bolt-compatibility-matrix.md'), matrix);
console.log(JSON.stringify({ requirements: requirements.length, triaged_issues: triaged.length, public_sources: sourceRows.length, output: compatibilityDir }));
