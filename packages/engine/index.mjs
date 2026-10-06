// @jobdar/engine — the single source of truth for the deterministic engine.
//
// Re-exports the PURE, fs-free lib/ modules (decoupled from config.mjs in Phase 9.0) so the apps run the
// EXACT same scoring / gating / level-filtering the CLI runs — no forked re-implementation. The CLI still
// imports lib/ directly; this package is what the web/native apps import (via the pnpm workspace, so Metro
// resolves it as a real node_module). fs/config-coupled modules (the pipeline/outreach/customize stores)
// stay in lib and are reached through the app's own Store adapter — they are NOT part of this surface.
export * from '../../lib/bands.mjs'
export * from '../../lib/levels.mjs'
export * from '../../lib/dates.mjs'
export * from '../../lib/regions.mjs'
export * from '../../lib/salary.mjs'
export * from '../../lib/html.mjs'
export * from '../../lib/cv_render.mjs'
export * from '../../lib/prescreen.mjs'
export * from '../../lib/inference.mjs'
export * from '../../lib/eval_engine.mjs'
export * from '../../lib/tailor.mjs'
export * from '../../lib/search.mjs'
// Phase 10 (fully-local apps): the pure pipeline logic, the pure outreach rules/drafting, and the
// scanner providers (fetch-based — native apps have no CORS; key-gated creds come through the fs-free
// providers/_creds.mjs seam, dormant by default).
export * from '../../lib/pipeline_pure.mjs'
export * from '../../lib/outreach_pure.mjs'
export * from '../../lib/liveness.mjs' // 1.53.0: listing-liveness probe (provider-contract based, fetch-only)
export * from '../../lib/report_pure.mjs' // 1.55.0: the beta-report builder (PII-free session artifact)
export { resolveProvider, allProviders, providerIds, fetchJobDescription, capNewest } from '../../providers/_contract.mjs'
export { setUsaJobsCredsSource } from '../../providers/_creds.mjs'
// The region employer catalog (generated from data/seed/employers.yml by scripts/gen-seed.mjs —
// parity-tested in test-all.mjs so it can't drift).
export { SEED_EMPLOYERS } from './seed.mjs'
// Which boards a scan reads (1.67.4): the requested regions' catalog boards + the person's own.
export * from '../../lib/portals_pure.mjs'
// Materialize catalog entries into portal configs — kept under its old name for the app.
export { employersToPortals as seedToPortals } from '../../lib/portals_pure.mjs'
