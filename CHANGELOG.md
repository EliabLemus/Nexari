# Changelog

All notable changes to Nexari are documented here. This project creates source tags and GitHub Releases; it does **not** publish npm packages.

## [0.1.0-dev] - 2026-08-29

### Added

- Clean-room runtime contract, Vivari adapter, deterministic compatibility gates, and isolated browser runtime lab.

## Release process

1. Update every package version that participates in the release and replace the development heading above with `## [X.Y.Z] - YYYY-MM-DD`.
2. Commit that release-preparation change to `main` after all local gates pass.
3. In GitHub Actions, manually run **Create Nexari Release** against that exact `main` commit with the same `X.Y.Z` input.
4. The workflow validates metadata and all gates, then creates `vX.Y.Z` and its GitHub Release. It never runs `npm publish`.
