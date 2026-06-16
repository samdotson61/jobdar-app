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
