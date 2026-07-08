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
export { resolveProvider, allProviders, providerIds, fetchJobDescription } from '../../providers/_contract.mjs'
export { setUsaJobsCredsSource } from '../../providers/_creds.mjs'
// The region employer catalog (generated from data/seed/employers.yml by scripts/gen-seed.mjs —
// parity-tested in test-all.mjs so it can't drift).
export { SEED_EMPLOYERS } from './seed.mjs'
// Materialize catalog entries into portal configs ({company, careers_url, provider?, site?}) — the pure
// core of lib/seed.mjs's toPortals, mirrored here because seed.mjs is config/fs-coupled.
export function seedToPortals(employers) {
  return (employers || []).map((e) => {
    const p = { company: e.company, careers_url: e.careers_url }
    if (e.provider) p.provider = e.provider
    if (e.site) p.site = e.site
    return p
  })
}
