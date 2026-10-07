# Verified browser asset bundle specification

The browser-stack producer SHALL publish an immutable static-runtime package alongside the runtime contract, core SDK, and adapter packages.

The static-runtime package SHALL contain byte-identical copies of the owned Vivari Service Worker, complete worker asset tree, complete vendor tree, `__vv-bridge.html`, and `__vv-preview-boot.html`.

The browser-stack manifest SHALL list SHA-256 values for each package tarball and every static-runtime payload file. Packaging SHALL fail if a required path is absent, an unallowlisted path is present, a payload entry is a symlink, or any recorded digest does not match its bytes.

A consumer SHALL resolve static files only from the installed, pinned static-runtime package. It SHALL serve and build-copy `/sw.js`, `/assets/**`, `/vendor/**`, `/__vv-bridge.html`, and `/__vv-preview-boot.html` at byte-identical paths. It SHALL reject path traversal and apply the Service Worker, MIME, and cross-origin-isolation headers required by the runtime.

A browser E2E SHALL prove that a clean consumer has no missing static resource during Nexari boot; a missing or modified required resource SHALL fail deterministically before the runtime is marked ready.
