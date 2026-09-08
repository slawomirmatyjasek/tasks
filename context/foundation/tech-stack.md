---
starter_id: 10x-astro-starter
package_manager: npm
project_name: pilne
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo learner shipping a small task-priority MVP in 1 week of after-hours work, with auth in scope (FR-001–003) and no AI/payments/realtime/background-jobs (per PRD non-goals). The 10x Astro Starter bundles Astro + React + TypeScript + Tailwind + Supabase + Cloudflare out of the box, clears all four agent-friendly quality gates (typed, convention-based, popular in training data, well-documented), and ships auth wiring already, which matches `has_auth: true` directly instead of requiring a separate integration step. Standard path taken — no reason to deviate from the recommended default for `(web-app, js)`, and no custom-path self-check was needed. Deployment defaults to Cloudflare Pages, the first entry in the starter's `deployment_defaults`, consistent with the plan to deploy in M1L5. CI runs on GitHub Actions with auto-deploy-on-merge, the starter's standard shape — matches the small-scope, low-QPS target scale from the PRD, so no custom CI flow is warranted.
