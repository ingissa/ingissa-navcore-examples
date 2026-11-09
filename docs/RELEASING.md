# Release & Maintenance Runbook

This runbook outlines the required procedures for building, validating, publishing, and maintaining packages in the NavCore SDK monorepo.

---

## 1. Publishing Order & Dependencies

Because adapter packages declare `@ingissa/navcore-core: ^1.0.x` as a peer dependency, releases must follow this topological order:

1. **Phase 1: Foundation Packages**
   - `@ingissa/navcore-types`
   - `@ingissa/navcore-core`
2. **Phase 2: Adapters & Tooling**
   - `@ingissa/navcore-mapbox`
   - `@ingissa/navcore-react-native`
   - `@ingissa/navcore-simulator`

---

## 2. Pre-Release Validation Quality Gates

Before publishing any package to npm, execute all automated validation scripts:

```bash
# 1. Compile all packages with flat distribution outputs
npm run build

# 2. Run unit test suites
npm test

# 3. Validate documentation, links, and export coverage
node scripts/check-docs.mjs

# 4. Dry-run tarball inspection
npm pack --dry-run --workspace=@ingissa/navcore-core
```

### Tarball Content Checklist
Verify that each packed archive contains:
- `dist/index.js` (CommonJS)
- `dist/index.mjs` (ESM)
- `dist/index.d.ts` (TypeScript declarations)
- `LICENSE`
- `README.md`
- **Zero leaks**: Confirm no `.env`, `.npmrc`, test files, or raw source maps leak into the tarball.

---

## 3. Deprecation & Versioning Policy

### Deprecate, Never Unpublish
Once a package version has been published to the npm registry, **never unpublish it**:
- Unpublishing breaks downstream dependency trees and builds.
- If a published release contains defects (as occurred in 1.0.7 and 1.0.8), immediately mark the specific version as deprecated:
  ```bash
  npm deprecate @ingissa/package-name@1.0.x "Broken distribution entrypoints; please upgrade to 1.0.9"
  ```
- Publish a follow-up patch release (e.g. `1.0.10`) with corrected distribution entries.

### Git Tag Policy
- Every production npm release must correlate to an annotated Git tag formatted as `v<version>` (e.g. `v1.0.9`).
- Tags must be signed and created only after registry confirmation.