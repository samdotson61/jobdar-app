import { create } from 'zustand';
import {
  type Job, type Scored, type Verdict, type Tailored, type Draft, type Profile, type Lang, type Band, type Criterion,
  CADENCE,
} from './engine';
import { serveGet, servePost, serveHealth } from './serve';

// The app holds NO engine logic — it renders what `jobdar serve` (the real CLI + winc) returns. Every
// action is a thin call to serve; `@jobdar/engine` is used only for derived UI (band colors, cadence labels).

export interface Contact { url: string; person: string; date: string; kind: 'contact' | 'followup' }
export interface SearchTerms { keywords: string[]; titles: string[]; exclude: string[]; level?: string; regions?: string[] }

interface State {
  profile: Profile;
  cv: string;
  intent: string;               // free-text "what are you looking for?"
  searchTerms: SearchTerms | null; // parsed intent (winc/keywords) — drives relevance ranking + cutting
  serveUp: boolean;
  busy: string | null;          // url/operation currently in flight (for spinners)
  progress: number;             // 0..1 for the "Find matching roles" search; 0 = idle
  lastIntent: string;           // the intent the last search ran with (to avoid re-running the same scan)
  scored: Scored[];
  verdicts: Record<string, Verdict>;
  tailored: Record<string, Tailored>;
  drafts: Record<string, Draft>;
  ledger: Contact[];
  // actions (existing signatures unchanged so the other tabs are untouched)
  setLang: (l: Lang) => void;
  toggleTransferable: () => void;
  setCv: (t: string) => void;
  setIntent: (t: string) => void;
  loadResume: (text: string, name?: string) => void;
  loadSampleCv: () => void;     // repurposed: re-pull live state from serve
  hydrate: () => void;
  runSearch: () => void;        // parse intent → scan → prescreen (intent-relevant first), with progress
  scoreOne: (url: string) => void;
  tailorOne: (url: string, directives: string[]) => void;
  draftOne: (url: string, person: string) => void;
  logContact: (url: string, person: string) => { ok: boolean; reason?: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const num = (x: any) => Number(x) || 0;
const WEIGHTS: Record<string, number> = { skills: 0.35, experience: 0.25, level_fit: 0.2, logistics: 0.1, education: 0.1 };

// Map a real pipeline.tsv row (from serve) → the app's Scored shape the Search tab renders.
const rowToScored = (r: any): Scored => ({
  company: r.company, role: r.role, url: r.url, location: r.location, postedOn: r.posted, jd: '',
  prescreen: num(r.prescreen),
  screenReason: r.screen_reason
    ? r.screen_reason
    : String(r.prescreen || '').trim()
      ? `on-target · ${r.prescreen}/100`
      : 'discovered',
  gate: r.screen_reason || undefined,
  confirm: r.screen_reason ? 'skip' : num(r.prescreen) >= 55 ? 'fit' : num(r.prescreen) >= 28 ? 'maybe' : 'skip',
});
const byScore = (a: Scored, b: Scored) => Number(Boolean(a.gate)) - Number(Boolean(b.gate)) || b.prescreen - a.prescreen;
const rowsToScored = (rows: any[]) => (rows || []).filter((r) => r && r.url).map(rowToScored).sort(byScore);

// Map serve's verdict (buildVerdict shape) → the app's Verdict. The 0–5 score, band, clamp + pay are the
// engine's; criteria come from the model's per-criterion judgments.
const verdictFromServe = (v: any): Verdict => ({
  score: num(v.score),
  band: (v.band || 'dont') as Band,
  criteria: Object.keys(WEIGHTS).map((k): Criterion => ({
    key: k, weight: WEIGHTS[k],
    judgment: (v.judgments && v.judgments[k] && v.judgments[k].rating) || 'none',
    evidence: (v.judgments && v.judgments[k] && v.judgments[k].evidence) || '',
  })),
  pay: typeof v.pay === 'string' ? v.pay : '—',
  clamped: v.clamped ? v.recommendation || 'hard gate' : undefined,
});

export const useStore = create<State>((set, get) => ({
  profile: { name: '', language: 'en', regions: ['midwest'], levels: ['entry', 'mid'], transferable: false },
  cv: '',
  intent: '',
  searchTerms: null,
  serveUp: false,
  busy: null,
  progress: 0,
  lastIntent: '',
  scored: [],
  verdicts: {},
  tailored: {},
  drafts: {},
  ledger: [],

  setLang: (language) => set((s) => ({ profile: { ...s.profile, language } })),
  toggleTransferable: () => set((s) => ({ profile: { ...s.profile, transferable: !s.profile.transferable } })),
  setCv: (cv) => set({ cv }),
  setIntent: (intent) => set({ intent }),
  // Persist the uploaded résumé to serve (data/cv.md) so scan/prescreen/eval all judge against THIS text,
  // not a stale on-disk résumé. Model actions below also send the live cv in-band as a belt-and-suspenders.
  loadResume: (text, name) => {
    set((s) => ({ cv: text, profile: { ...s.profile, name: (name && name.trim()) || s.profile.name } }));
    servePost('/cv', { content: text }).catch(() => {});
  },
  loadSampleCv: () => get().hydrate(),

  // Pull the live state from serve: the real profile (regions/levels/transferable), the real résumé
  // (data/cv.md), and the real pipeline rows. No-op (serveUp:false) if serve isn't running yet.
  hydrate: async () => {
    const h = await serveHealth();
    set({ serveUp: h.ok });
    if (!h.ok) return;
    try {
      const [pipe, prof, cv] = await Promise.all([serveGet('/pipeline'), serveGet('/profile'), serveGet('/cv')]);
      const rows = (pipe && pipe.rows) || [];
      set((s) => ({
        scored: rowsToScored(rows),
        cv: (cv && cv.content) || s.cv,
        profile: {
          ...s.profile,
          name: (prof && prof.name) || s.profile.name,
          language: (prof && prof.language) || s.profile.language,
          regions: (prof && prof.target_regions) || s.profile.regions,
          levels: (prof && prof.target_levels) || s.profile.levels,
          transferable: Boolean(prof && prof.transferable_skills),
        },
      }));
      // Auto-prescreen on first load: if the pipeline is all discovered (no scores), score a first batch
      // so the list ranks meaningfully the moment Search opens — instead of an all-grey "0/100" wall.
      const anyScored = rows.some((r: any) => String(r.prescreen || '').trim());
      if (!anyScored && rows.some((r: any) => r && r.url)) {
        set({ busy: 'scan' });
        try {
          const pre = await servePost('/prescreen', { limit: 15 });
          if (pre && pre.ok !== false && Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
        } catch {
          /* live JD fetch flaked → keep the discovered list */
        }
        set((s) => (s.busy === 'scan' ? { busy: null } : {}));
      }
    } catch {
      /* leave prior state */
    }
  },

  // Intent-driven search with a live progress bar. Stages: parse the intent (winc, once) → scan (only when
  // the intent changed or we have nothing — so re-running doesn't repeat the same scan) → prescreen the
  // intent-RELEVANT pending roles first, in batches, advancing the bar. The list re-ranks/cuts to the
  // intent client-side (see the Search tab) so a tweaked query re-ranks instantly without a re-scan.
  runSearch: async () => {
    const intent = get().intent.trim();
    const prevIntent = get().lastIntent;
    const intentChanged = intent !== prevIntent;
    set({ busy: 'scan', progress: 0.04 });
    try {
      // 1) Parse intent → search terms (winc when up; deterministic keywords otherwise). Re-parse only on change.
      let terms = get().searchTerms;
      if (intent && (intentChanged || !terms)) {
        const parsed = await servePost('/search/parse', { intent });
        if (parsed && parsed.ok !== false) {
          terms = { keywords: parsed.keywords || [], titles: parsed.titles || [], exclude: parsed.exclude || [], level: parsed.level, regions: parsed.regions };
          set({ searchTerms: terms });
        }
      } else if (!intent) {
        terms = null; set({ searchTerms: null });
      }
      set({ progress: 0.12 });
      // 2) Scan — only when the intent changed or we have no roles yet (avoids re-running an identical scan).
      if (intentChanged || get().scored.length === 0) {
        const levels = terms && terms.level ? [terms.level] : get().profile.levels;
        const regions = terms && terms.regions && terms.regions.length ? terms.regions : get().profile.regions;
        await servePost('/scan', { levels, regions });
      }
      set({ progress: 0.4 });
      // 3) Prescreen the most relevant pending roles, in batches, with a live percentage.
      const TARGET = 40, BATCH = 8;
      let processed = 0;
      for (let i = 0; i < Math.ceil(TARGET / BATCH); i++) {
        const pre = await servePost('/prescreen', { limit: BATCH, terms: terms || undefined });
        if (!pre || pre.ok === false) break;
        if (Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
        processed += Number(pre.checked) || 0;
        set({ progress: Math.min(0.98, 0.4 + 0.58 * Math.min(1, processed / TARGET)) });
        if (!pre.checked || pre.checked < BATCH) break; // pending exhausted
      }
      set({ progress: 1, lastIntent: intent });
    } catch {
      /* network/serve error → keep prior rows */
    }
    set((s) => (s.busy === 'scan' ? { busy: null, progress: 0 } : {}));
  },

  scoreOne: async (url) => {
    set({ busy: url });
    try {
      const cv = get().cv;
      const v = await servePost('/evaluate', { url, cv: cv || undefined, transferable: get().profile.transferable });
      if (v && v.ok !== false && v.score != null) {
        set((s) => ({ verdicts: { ...s.verdicts, [url]: verdictFromServe(v) } }));
        const row = get().scored.find((r) => r.url === url);
        await servePost('/eval/save', { url, score: v.score, band: v.band, recommendation: v.recommendation, company: row && row.company, role: row && row.role, location: row && row.location });
      }
    } catch {
      /* surfaced as no verdict; backend may be down */
    }
    // Clear the spinner only if THIS op is still the one in flight (a later op may have taken the slot).
    set((s) => (s.busy === url ? { busy: null } : {}));
  },

  tailorOne: async (url, directives) => {
    set({ busy: url });
    try {
      const r = await servePost('/tailor', { url, directives, cv: get().cv || undefined });
      if (r && r.ok) set((s) => ({ tailored: { ...s.tailored, [url]: { summary: r.summary, coverLetter: r.coverLetter, keywords: r.keywords || [] } } }));
    } catch {
      /* backend down → no tailored output */
    }
    set((s) => (s.busy === url ? { busy: null } : {}));
  },

  draftOne: async (url, person) => {
    set({ busy: url });
    try {
      const r = await servePost('/outreach/draft', { url, person, cv: get().cv || undefined });
      if (r && r.ok) set((s) => ({ drafts: { ...s.drafts, [url]: { message: r.note, problems: r.problems || [] } } }));
    } catch {
      /* backend down → no draft */
    }
    set((s) => (s.busy === url ? { busy: null } : {}));
  },

  // Cadence shows immediately (same CADENCE constant the server enforces); the real ledger write is fired
  // to serve and is authoritative on the next hydrate.
  logContact: (url, person) => {
    const { ledger } = get();
    const forRole = ledger.filter((e) => e.url === url && e.kind === 'contact');
    if (forRole.some((e) => e.person.trim().toLowerCase() === person.trim().toLowerCase())) return { ok: false, reason: 'duplicate_person' };
    if (forRole.length >= CADENCE.maxContactsPerRole) return { ok: false, reason: 'role_cap' };
    const entry: Contact = { url, person, date: today(), kind: 'contact' };
    set({ ledger: [...ledger, entry] });
    // serve enforces the same cadence authoritatively; if it rejects (e.g. a cap already hit on disk from a
    // prior session), revert the optimistic append so the UI doesn't claim a contact serve didn't record.
    servePost('/outreach/log', { url, person, kind: 'contact' }).then((r) => {
      if (r && r.ok === false) set((s) => ({ ledger: s.ledger.filter((e) => e !== entry) }));
    }).catch(() => {});
    return { ok: true };
  },
}));

// Auto-pull live state from serve on launch (no-op if serve isn't up yet — the user can retry via scan).
useStore.getState().hydrate();
