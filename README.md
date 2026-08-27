# Nexari

Nexari is an **isolated, self-hosted browser runtime**. It begins as a maintained fork of [Vivari](https://github.com/maitrungduc1410/vivari) (MIT), then closes only clean-room, evidence-backed compatibility gaps required by a pinned read-only revision of Bolt.DIY.

It is not a Linux VM, Docker replacement, native Node runtime, or a copy of StackBlitz WebContainers. v86 remains a separate Linux Lab project.

## Status

`0.1.0-dev` is the contract-and-provenance milestone. It establishes the target, source policy, and deterministic gates before any host integration or runtime-semantic fork changes.

## Boundaries

- Bolt.DIY is an analysis input only. This repository does not modify it.
- StackBlitz proprietary runtime artifacts are forbidden. Public documentation, the public API package, and host-observable behavior are the only compatibility inputs.
- The Vivari source is pinned at `9a89ff328b87ad0fb6a180d4401ea418c180cbe7`; its `upstream` remote has push disabled.
- Future hosts consume Nexari through `BrowserRuntime`; they never import the fork directly.
- No remote fork, package publication, deployment, or Bolt integration occurs without Human Owner approval.

## Local gates

```text
npm run generate:compatibility
npm test
npm run build
git diff --check
```

## Source policy

See `compatibility/stackblitz-public-contract-ledger.md`, `compatibility/bolt-webcontainers-inventory.json`, `compatibility/bolt-open-runtime-issues.json`, and the OpenSpec change under `openspec/changes/add-bolt-compatible-vivari-runtime/`.
