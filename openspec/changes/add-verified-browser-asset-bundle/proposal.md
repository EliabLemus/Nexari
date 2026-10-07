# Add verified Nexari browser asset bundle

## Why

The Nexari browser runtime is not delivered by JavaScript packages alone. `@vivari/core` loads a same-origin Service Worker, hashed worker chunks, bridge documents, and a 117,166,080-byte vendor tree at runtime. The existing `pack:browser-stack` output carries only three JavaScript package tarballs, so a clean Bolt host cannot serve the complete runtime from immutable inputs.

## Scope

- Produce a fourth immutable `@nexari/vivari-browser-assets` package tarball from the owned Vivari fork.
- Include the exact runtime static graph: `/sw.js`, `/assets/**`, `/vendor/**`, `__vv-bridge.html`, and `__vv-preview-boot.html`.
- Record SHA-256 for every tarball and every packaged static file in `artifacts/browser-stack/manifest.json`.
- Verify a clean consumer can resolve the static package without producer-repository symlinks.
- Add a Bolt-host Vite integration that serves the package in development and materializes the same paths into the production client build.
- Add browser proof that the host can boot Nexari without missing static runtime resources.

## Non-goals

No StackBlitz runtime inspection, no mutable producer-directory links, no v86 fusion, Docker, Linux/ELF execution, native addons, SSH, arbitrary network access, publication, deployment, or push.

## Success

A consumer with only the verified browser-stack tarballs can serve every required static runtime resource at its expected URL, prove byte identity against the manifest, and boot the owned Nexari runtime in an isolated browser. Missing or altered assets fail deterministically before boot.
