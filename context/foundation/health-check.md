---
project: pilne
checked_at: 2026-09-07T07:33:20Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 2
  moderate: 1
  low: 1
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 3
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit (after npm audit fix, no --force)
Summary: 0 CRITICAL, 2 HIGH, 1 MODERATE, 1 LOW
Direct vs transitive: all remaining findings are transitive (esbuild, sharp — pulled in via astro's own dependency tree)
```

#### HIGH findings

- **esbuild** 0.27.3–0.28.0 — GHSA-g7r4-m6w7-qqqr: arbitrary file read via the dev server on Windows. Fix requires `npm audit fix --force`, which upgrades `astro` to `7.3.1` (breaking change vs. the pinned `astro ^6.3.1` from the starter).
- **sharp** <0.35.0 — inherited libvips CVEs (2026-33327/33328/35590/35591). Same fix path as above (forces astro@7).

MODERATE and LOW findings: 1 moderate + 1 low, both transitive dev-tooling advisories already reduced by `npm audit fix`; no direct fix available without the same astro@7 bump.

**Decision:** did not run `npm audit fix --force`. `tech-stack.md` pins the course's recommended Astro 6 starter; jumping to Astro 7 is an unreviewed breaking change outside the scope of bootstrap and would drift from the course chain's assumptions. Revisit if astro@7 compatibility with the 10x-astro-starter conventions is confirmed later.

### Outdated Dependencies

```
Packages with major version gaps: 1 (astro — pinned intentionally, see above)
```

## Test Suite

```
Test runner: not detected
Tests found: not applicable
Test execution: not attempted
```

⚠ No test runner detected. The agent cannot verify its own changes yet. This is expected at this stage — see Category B below.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                         |
| ---------- | ------ | ------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (eslint)                                       |
| Test       | ✗      | not configured — no test runner yet                           |
| Build      | ✓      | `npm run build` (astro build, needs SUPABASE_URL/KEY secrets) |
| Type check | ✓      | `npx astro sync` + strict tsconfig (`astro/tsconfigs/strict`) |
| Security   | ✗      | not configured — no `npm audit` step in CI                    |

## Configuration

All expected configuration files present. No gaps detected.

- `.env.example` present (documents required `SUPABASE_URL` / `SUPABASE_KEY`)
- `.gitignore` correctly excludes `.env` and `.env.production`
- `.husky/pre-commit` configured (lint-staged: eslint --fix on ts/tsx/astro, prettier on json/css/md)
- `eslint.config.js`, `.prettierrc.json`, `tsconfig.json` (strict) all present
- `wrangler.jsonc` present — Cloudflare Workers/Pages deployment config already scaffolded

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run `/10x-stack-assess` for quality-gate analysis (not applicable here — this is a fresh greenfield bootstrap from a verified/first-class starter, not an inherited codebase).

## Recommended Fixes

### Fix before agent work (Category A)

None. No CRITICAL findings, lockfile present, type-check and lint both wired into CI, all expected configuration files present. The two remaining HIGH audit findings are transitive dev-tooling issues gated behind an unreviewed major-version bump — tracked, not blocking.

### Addressed in upcoming lessons (Category B)

### No test runner

**Lesson**: M3L1–M3L2 — Plan testów z AI / Od planu do testów
**What you'll do there**: build a risk-map-driven test plan and add a test runner (Vitest) with the first unit test — this also satisfies the course's graduation requirement of at least one test covering a key user flow.

### No CI test/security stage

**Lesson**: M3L3 — Hooki i triggery
**What you'll do there**: extend `.github/workflows/ci.yml` with a test stage once a runner exists, and layer local hooks (per-edit → pre-commit → pre-push) before CI, per the 4-layer quality-gate model.

### No production deployment yet

**Lesson**: M1L5 — Od localhost po produkcję
**What you'll do there**: research Cloudflare/Supabase account setup, write `infrastructure.md` + `deploy-plan.md`, and run the first `wrangler deploy` to get a public URL. `wrangler.jsonc` is already scaffolded by the starter, so this lesson is mostly account setup + secrets, not new config.

## Summary

Health status: needs-attention

The bootstrap is clean: lockfile present, strict TypeScript, lint and type-check wired into CI, sensible `.gitignore`/`.env.example`, and Cloudflare deployment config already scaffolded by the starter. The only real gap is the complete absence of a test runner (expected — that's module 3's job), plus two transitive HIGH audit findings that are gated behind an intentionally-deferred Astro 7 upgrade. Nothing here blocks agent-assisted development.

Next step: proceed to agent onboarding (M1L4 — write `AGENTS.md`/`CLAUDE.md`), then M1L5 deployment. Revisit the test runner gap in module 3, not before.
