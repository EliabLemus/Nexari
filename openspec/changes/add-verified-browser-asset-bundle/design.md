# Design

## Immutable delivery boundary

`pack:browser-stack` SHALL emit four tarballs:

1. `@nexari/runtime-contract`
2. `@vivari/core`
3. `@nexari/vivari-adapter`
4. `@nexari/vivari-browser-assets`

The fourth package is generated from the owned fork at pack time. Its published `dist/` tree SHALL contain:

```text
dist/sw.js
dist/assets/**
dist/vendor/**
dist/__vv-bridge.html
dist/__vv-preview-boot.html
```

It is the sole source for host static runtime files. A consumer MUST install its pinned tarball; it MUST NOT read from a producer checkout, symlink a producer directory, or fetch runtime files dynamically.

## Integrity manifest

`artifacts/browser-stack/manifest.json` SHALL contain a SHA-256 for each tarball and a path-to-SHA-256 map for the complete static package payload. The pack command SHALL reject unexpected files, missing required paths, symlinks, non-file entries, or a mismatch between the static package and the canonical Vivari sources.

The clean-consumer verification SHALL install all four tarballs, resolve the static package through Node package resolution, and validate manifest hashes without a repository path.

## Host serving contract

The Bolt Vite integration SHALL resolve the installed static package once, then use a single path-safe asset resolver for both development middleware and production build copying. It SHALL expose exactly these URL mappings:

```text
/sw.js                         -> dist/sw.js
/assets/<known file>           -> dist/assets/<known file>
/vendor/<known file>           -> dist/vendor/<known file>
/__vv-bridge.html              -> dist/__vv-bridge.html
/__vv-preview-boot.html        -> dist/__vv-preview-boot.html
```

The resolver SHALL reject traversal and symlinks. Development responses SHALL preserve JavaScript, HTML, WASM, and octet-stream MIME requirements, apply COOP `same-origin` and COEP `require-corp`, and emit `Service-Worker-Allowed: /` for `/sw.js`. Production output SHALL materialize identical bytes under the same paths.

## Test strategy

1. Producer RED/GREEN tests assert the static tarball contains every required class and manifest hash.
2. Consumer RED/GREEN tests assert every published host file equals the installed package payload and traversal is rejected.
3. A production-build probe verifies materialized paths and MIME headers.
4. Isolated Chrome E2E boots Nexari, asserts a Service Worker controller, and rejects missing-resource, worker-load, and boot errors.

## Constraints

The vendor tree is currently 117,166,080 bytes. It remains a pinned local artifact, not a hidden network dependency. Any future size reduction requires a separately specified capability profile; this change ships the complete current graph first.
