# Tasks

- [ ] Add a generated `@nexari/vivari-browser-assets` package with an explicit allowlist of Service Worker, worker assets, bridge documents, and vendor tree. Write a failing packability test first.
- [ ] Extend `scripts/pack-browser-stack.mjs` to pack four artifacts, hash tarballs and static payload files, and reject missing, extra, or symlinked payload entries. Add RED/GREEN manifest tests.
- [ ] Extend clean-consumer verification to install and resolve the fourth tarball without producer paths.
- [ ] Add a Bolt host asset-serving plugin that resolves only the installed static package, serves correct headers in development, and copies identical bytes into production output. Add path traversal and byte-identity tests first.
- [ ] Replace the untracked hand-copied Bolt `public/` experiment with the verified host integration.
- [ ] Run producer package tests, Bolt focused tests/lint/typecheck, production-build asset probe, isolated Chrome Nexari boot E2E, `git diff --check`, and a final frozen-diff review.
- [ ] Commit producer and host slices separately. Do not push or deploy without explicit authorization.
