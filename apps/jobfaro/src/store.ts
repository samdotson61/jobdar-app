import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type Job, type Scored, type Verdict, type Tailored, type Draft, type Profile, type Lang, type Band, type Criterion,
  CADENCE,
} from './engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendMode, serveGet, servePost, serveHealth } from './serve';
import { regionForLocation } from '@jobfaro/engine';

// The app holds NO engine logic — it renders what `jobfaro serve` (the real CLI + winc) returns. Every
// action is a thin call to serve; `@jobfaro/engine` is used only for derived UI (band colors, cadence labels).

export interface Contact { url: string; person: string; date: string; kind: 'contact' | 'followup' }
export interface SearchTerms { keywords: string[]; titles: string[]; exclude: string[]; level?: string; regions?: string[] }

interface State {
  profile: Profile;
  cv: string;
  resumeFile: string;           // uploaded résumé file name (shown in green under the upload button)
  intent: string;               // free-text "what are you looking for?"
  searchTerms: SearchTerms | null; // parsed intent (winc/keywords) — drives relevance ranking + cutting
  serveUp: boolean;
  modelUp: boolean;             // local mode: the on-device model is installed (health backend.up)
  busy: string | null;          // url/operation currently in flight (for spinners)
  scoring: boolean;             // a batch score-top-N pass is running
  progress: number;             // 0..1 for the "Find matching roles" search; 0 = idle
  lastIntent: string;           // the intent the last search ran with (to avoid re-running the same scan)
  lastScope: string;            // region+level signature the last scan ran with (re-scan when it changes)
  regionsUserSet: boolean;      // the user manually chose regions → a résumé upload won't override them
  levelsUserSet: boolean;       // the user manually chose levels  → a résumé upload won't override them
  onboarded: boolean;           // false on a true first boot → the onboarding screen shows (persisted)
  savedProfileName: string;     // peek of config/profile.yml's name (for a "continue as <name>" offer); not persisted
  scored: Scored[];
  verdicts: Record<string, Verdict>;
  feedback: Record<string, 'up' | 'down'>;   // thumbs the user gave a verdict (persisted; feeds calibration)
  tailored: Record<string, Tailored>;
  drafts: Record<string, Draft>;
  ledger: Contact[];
  // actions (existing signatures unchanged so the other tabs are untouched)
  setLang: (l: Lang) => void;
  toggleTransferable: () => void;
  toggleSponsorship: () => void;       // "I need visa sponsorship" — re-gates the list (explicit-no roles screen out)
  toggleRegion: (r: string) => void;   // tune the search scope — re-scans on the next "Find matching roles"
  toggleLevel: (l: string) => void;
  setSalary: (n: number) => void;      // preferred target salary (0 = any) — nudges prescreen rank + pay band
  setCv: (t: string) => void;
  setIntent: (t: string) => void;
  loadResume: (text: string, fileName?: string) => void;
  uploadResume: (fileName: string, base64: string) => Promise<{ ok: boolean; error?: string }>; // parse docx/pdf/txt bytes via serve
  saveProfileToCli: () => void;        // persist the chosen identity to config/profile.yml (durable across devices/reloads)
  setOnboarded: (v: boolean) => void;
  continueAsSaved: () => void;         // load a saved CLI profile (config/profile.yml + cv.md) into the app
  loadSampleCv: () => void;     // repurposed: re-pull live state from serve
  hydrate: () => void;
  runSearch: () => void;        // parse intent → scan → prescreen (intent-relevant first), with progress
  rescore: () => void;          // re-prescreen the relevant rows against the current résumé (re-upload)
  discover: () => void;         // winc suggests companies for the intent → probe ATS → scan the new boards
  scoreOne: (url: string) => void;
  scoreTopN: (n: number) => void;                         // batch-eval the top relevant unscored roles (pool)
  rateVerdict: (url: string, thumb: 'up' | 'down') => void; // thumbs feedback → the calibration ledger
  tailorOne: (url: string, directives: string[]) => void;
  draftOne: (url: string, person: string) => void;
  logContact: (url: string, person: string) => { ok: boolean; reason?: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const num = (x: any) => Number(x) || 0;

// Persist the user's own state on BOTH platforms — web and native behave identically. First boot has NO
// stored key → the app starts blank; once the user uploads a résumé or makes a selection, the change is
// saved and restored on the next load.
//   web    → synchronous localStorage (unchanged key, so existing users keep their state, and hydration
//            stays synchronous — no flash of the blank/onboarding state before the real one)
//   native → AsyncStorage (zustand's createJSONStorage handles the Promise-returning variant)
const stateStorage = {
  getItem: (k: string): string | null | Promise<string | null> => {
    try { if (typeof localStorage !== 'undefined') return localStorage.getItem(k); } catch { return null; }
    return AsyncStorage.getItem(k).catch(() => null);
  },
  setItem: (k: string, v: string): void | Promise<void> => {
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; } } catch { return; /* private mode / no storage */ }
    return AsyncStorage.setItem(k, v).catch(() => {});
  },
  removeItem: (k: string): void | Promise<void> => {
    try { if (typeof localStorage !== 'undefined') { localStorage.removeItem(k); return; } } catch { return; }
    return AsyncStorage.removeItem(k).catch(() => {});
  },
};

const startTicker = (set: any, get: any) => {
  const id = setInterval(() => {
    const s = get();
    if (s.busy && s.progress > 0 && s.progress < 0.95) set({ progress: Math.min(0.95, s.progress + 0.015) });
  }, 250);
  return () => clearInterval(id);
};
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
  // The JD explicitly stated it sponsors visas (prescreen wrote `sponsors-visa` to the row's notes).
  sponsors: String(r.notes || '').includes('sponsors-visa') || undefined,
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

export const useStore = create<State>()(persist((set, get) => ({
  // Starts BLANK — no identity is seeded. Profile is filled only by an uploaded résumé or the user's choices.
  // transferable defaults ON: the app's users are new grads / early-career / career-changers, exactly who
  // need adjacent-skill credit (it changes what counts as a fit, not how many pass). The user can toggle off.
  // sponsorship defaults OFF: it's a personal status only the user can assert; when on, explicit
  // "no sponsorship" JDs screen out and explicit "we sponsor" JDs get a ✓ indicator (silent JDs untouched).
  profile: { name: '', language: 'en', regions: [], levels: [], transferable: true, sponsorship: false, salary: 0 },
  cv: '',
  resumeFile: '',
  intent: '',
  searchTerms: null,
  serveUp: false,
  modelUp: false,
  busy: null,
  scoring: false,
  progress: 0,
  lastIntent: '',
  lastScope: '',
  regionsUserSet: false,
  levelsUserSet: false,
  onboarded: false,
  savedProfileName: '',
  scored: [],
  verdicts: {},
  feedback: {},
  tailored: {},
  drafts: {},
  ledger: [],

  setLang: (language) => set((s) => ({ profile: { ...s.profile, language } })),
  toggleTransferable: () => set((s) => ({ profile: { ...s.profile, transferable: !s.profile.transferable } })),
  // Toggling sponsorship changes which roles are GATES (not just rank) — re-prescreen so the visible list
  // is honest immediately, and persist the choice to the CLI profile like the other identity fields.
  toggleSponsorship: () => {
    set((s) => ({ profile: { ...s.profile, sponsorship: !s.profile.sponsorship } }));
    get().saveProfileToCli();
    if (get().scored.length) get().rescore();
  },
  // Region/level are the search SCOPE. Toggling keeps at least one selected; the next "Find matching
  // roles" re-scans with the new scope (lastScope mismatch forces it), and the visible list filters live.
  toggleRegion: (r) => set((s) => {
    const has = s.profile.regions.includes(r);
    const regions = has ? s.profile.regions.filter((x) => x !== r) : [...s.profile.regions, r];
    return { profile: { ...s.profile, regions: regions.length ? regions : s.profile.regions }, regionsUserSet: true };
  }),
  toggleLevel: (l) => set((s) => {
    const has = s.profile.levels.includes(l);
    const levels = has ? s.profile.levels.filter((x) => x !== l) : [...s.profile.levels, l];
    return { profile: { ...s.profile, levels: levels.length ? levels : s.profile.levels }, levelsUserSet: true };
  }),
  setCv: (cv) => set({ cv }),
  setSalary: (n) => set((s) => ({ profile: { ...s.profile, salary: Number(n) || 0 } })),
  // Save the chosen identity to the CLI config (this machine) so it survives a cleared browser / new device.
  saveProfileToCli: () => {
    const p = get().profile;
    servePost('/profile', {
      name: p.name, language: p.language,
      target_regions: p.regions, target_levels: p.levels,
      target_salary: p.salary, transferable_skills: p.transferable, needs_sponsorship: p.sponsorship,
    }).catch(() => {});
  },
  setIntent: (intent) => set({ intent }),
  // Persist the uploaded résumé to serve (data/cv.md) so scan/prescreen/eval all judge against THIS text,
  // not a stale on-disk résumé. Model actions below also send the live cv in-band as a belt-and-suspenders.
  loadResume: (text, fileName) => {
    set((s) => ({ cv: text, resumeFile: (fileName && fileName.trim()) || s.resumeFile }));
    servePost('/cv', { content: text }).catch(() => {});
  },

  // Upload a résumé FILE (docx/pdf/txt): serve parses the bytes (docparse) → extracted text becomes the
  // active résumé, then we re-rank the relevant roles against it. Returns {ok,error} so the UI can be honest.
  uploadResume: async (fileName, base64) => {
    set({ busy: 'scan', progress: 0.12 });
    const stopTick = startTicker(set, get);
    const bump = (p: number) => set((s) => ({ progress: Math.max(s.progress, p) }));
    let result: { ok: boolean; error?: string } = { ok: false };
    try {
      const r = await servePost('/import/upload', { name: fileName, base64 });
      if (r && r.ok && typeof r.text === 'string') {
        // Seed the profile FROM the résumé so the UI reflects whose search this is — name always; region
        // (from the résumé's location) and level only when the user hasn't manually chosen them (their
        // choice wins). The chips + name pill render from profile, so the UI updates immediately.
        const f = (r.fields || {}) as { name?: string; location?: string; level?: string };
        const s0 = get();
        const newProfile = { ...s0.profile };
        if (f.name && f.name.trim()) newProfile.name = f.name.trim();
        if (!s0.regionsUserSet && f.location) { const reg = regionForLocation(f.location); if (reg) newProfile.regions = [reg]; }
        if (!s0.levelsUserSet && f.level && ['entry', 'mid', 'senior'].includes(f.level)) newProfile.levels = [f.level];
        const scopeSig = (p: any) => `${[...p.regions].sort().join(',')}|${[...p.levels].sort().join(',')}`;
        const scopeChanged = scopeSig(newProfile) !== scopeSig(s0.profile);
        set({ cv: r.text, resumeFile: r.name || fileName, profile: newProfile });
        get().saveProfileToCli(); // an uploaded identity persists to config/profile.yml (durable)
        result = { ok: true };
        bump(0.35);
        // If the résumé moved the region/level, re-scan so the roles match the new profile (not the old one).
        if (scopeChanged) {
          const sr = await servePost('/scan', { levels: newProfile.levels, regions: newProfile.regions });
          if (sr && sr.ok !== false && Array.isArray(sr.rows)) set({ scored: rowsToScored(sr.rows) });
          set({ lastScope: scopeSig(newProfile) });
        }
        bump(0.5);
        // Re-fit the roles against the new résumé (skill overlap changed → fit indicators change).
        const terms = get().searchTerms || undefined;
        const TARGET = 30, BATCH = 6; let processed = 0;
        for (let i = 0; i < Math.ceil(TARGET / BATCH); i++) {
          const pre = await servePost('/prescreen', { limit: BATCH, terms, rescore: true, cv: get().cv, targetSalary: get().profile.salary, needsSponsorship: get().profile.sponsorship });
          if (!pre || pre.ok === false) break;
          if (Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
          processed += Number(pre.checked) || 0;
          bump(Math.min(0.94, 0.5 + 0.44 * Math.min(1, processed / TARGET)));
          if (!pre.checked || pre.checked < BATCH) break;
        }
        bump(1);
      } else {
        result = { ok: false, error: (r && r.error) || 'could not read this file' };
      }
    } catch {
      result = { ok: false, error: 'upload failed' };
    }
    stopTick();
    set((s) => (s.busy === 'scan' ? { busy: null, progress: 0 } : { progress: 0 }));
    return result;
  },
  loadSampleCv: () => get().hydrate(),

  // BLANK START: the app does NOT seed identity from the local config/profile.yml or data/cv.md. We only
  // check that serve is reachable; the profile, résumé, and roles are filled by an uploaded résumé or the
  // user's own choices (region/level/salary/intent → "Find matching roles"). A real onboarding lands later.
  hydrate: async () => {
    const h = await serveHealth();
    set({ serveUp: h.ok, modelUp: Boolean(h.backend && h.backend.up) });
    // Local mode: the device's pipeline FILE is the durable store — restore the list from it when the
    // in-memory cache is empty (e.g. after a cold start; the AsyncStorage cache is best-effort for
    // multi-MB row sets). User state (an in-flight session's rows) always wins.
    if (backendMode() === 'local' && get().scored.length === 0) {
      try {
        const pj = await serveGet('/pipeline');
        if (pj && pj.ok !== false && Array.isArray(pj.rows) && pj.rows.length) set({ scored: rowsToScored(pj.rows) });
      } catch { /* no pipeline yet — blank first boot stays blank */ }
    }
    // Peek (don't apply) any saved CLI profile so onboarding can offer "continue as <name>". The app stays
    // blank until the user uploads, makes a choice, or explicitly taps continue — blank-start is preserved.
    if (h.ok) {
      try { const prof = await serveGet('/profile'); if (prof && prof.name) set({ savedProfileName: String(prof.name) }); } catch { /* none */ }
    }
  },

  setOnboarded: (v) => set({ onboarded: v }),
  // "Continue as <name>": load the saved CLI profile (config/profile.yml + cv.md) into the app and finish.
  continueAsSaved: async () => {
    try {
      const [prof, cv] = await Promise.all([serveGet('/profile'), serveGet('/cv')]);
      if (prof && prof.name) {
        set((s) => ({
          profile: {
            ...s.profile,
            name: prof.name,
            language: prof.language || s.profile.language,
            regions: Array.isArray(prof.target_regions) ? prof.target_regions : s.profile.regions,
            levels: Array.isArray(prof.target_levels) ? prof.target_levels : s.profile.levels,
            transferable: Boolean(prof.transferable_skills),
            sponsorship: Boolean(prof.needs_sponsorship),
            salary: Number(prof.target_salary) || 0,
          },
          cv: (cv && cv.content) || s.cv,
          resumeFile: (cv && cv.content) ? (s.resumeFile || 'saved résumé') : s.resumeFile,
          regionsUserSet: true, levelsUserSet: true,
        }));
      }
    } catch { /* keep blank */ }
    set({ onboarded: true });
  },

  // Intent-driven search with a live progress bar. Stages: parse the intent (winc, once) → scan (only when
  // the intent changed or we have nothing — so re-running doesn't repeat the same scan) → prescreen the
  // intent-RELEVANT pending roles first, in batches, advancing the bar. The list re-ranks/cuts to the
  // intent client-side (see the Search tab) so a tweaked query re-ranks instantly without a re-scan.
  runSearch: async () => {
    const intent = get().intent.trim();
    const prevIntent = get().lastIntent;
    const intentChanged = intent !== prevIntent;
    const scopeSig = `${[...get().profile.regions].sort().join(',')}|${[...get().profile.levels].sort().join(',')}`;
    const scopeChanged = scopeSig !== get().lastScope;
    set({ busy: 'scan', progress: 0.04 });
    const stopTick = startTicker(set, get);
    const bump = (p: number) => set((s) => ({ progress: Math.max(s.progress, p) }));
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
      bump(0.15);
      // 2) Scan ONLY when the scope (region/level) changed or we have nothing yet — a scan re-fetches every
      //    company board (slow). Refining the intent does NOT re-scan: the discovered roles are already in the
      //    pipeline, so we just re-rank + prescreen them (fast). Show scan results immediately when we do scan.
      if (scopeChanged || get().scored.length === 0) {
        // Blank profile → search broadly (nationwide, all levels) rather than the server's saved config.
        const levels = terms && terms.level ? [terms.level] : (get().profile.levels.length ? get().profile.levels : ['entry', 'mid', 'senior']);
        const regions = terms && terms.regions && terms.regions.length ? terms.regions : (get().profile.regions.length ? get().profile.regions : ['nationwide']);
        const sr = await servePost('/scan', { levels, regions });
        if (sr && sr.ok !== false && Array.isArray(sr.rows)) set({ scored: rowsToScored(sr.rows) });
      }
      bump(0.45);
      // 3) Prescreen the most relevant pending roles, in batches, with a live percentage. Send the app's own
      //    cv + target salary so results reflect the user's state (not the server's saved config/cv.md).
      const TARGET = 30, BATCH = 6;
      let processed = 0;
      for (let i = 0; i < Math.ceil(TARGET / BATCH); i++) {
        const pre = await servePost('/prescreen', { limit: BATCH, terms: terms || undefined, cv: get().cv, targetSalary: get().profile.salary, needsSponsorship: get().profile.sponsorship });
        if (!pre || pre.ok === false) break;
        if (Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
        processed += Number(pre.checked) || 0;
        bump(Math.min(0.94, 0.45 + 0.49 * Math.min(1, processed / TARGET)));
        if (!pre.checked || pre.checked < BATCH) break; // pending exhausted
      }
      bump(1);
      set({ lastIntent: intent, lastScope: scopeSig });
    } catch {
      /* network/serve error → keep prior rows */
    }
    stopTick();
    set((s) => (s.busy === 'scan' ? { busy: null, progress: 0 } : {}));
  },

  // Re-prescreen the relevant rows against the CURRENT résumé (called after a re-upload) so scores/ranking
  // reflect the new résumé. No scan — just re-scores what's already discovered, intent-relevant first.
  rescore: async () => {
    set({ busy: 'scan', progress: 0.1 });
    const stopTick = startTicker(set, get);
    const bump = (p: number) => set((s) => ({ progress: Math.max(s.progress, p) }));
    try {
      const terms = get().searchTerms || undefined;
      const TARGET = 30, BATCH = 6;
      let processed = 0;
      for (let i = 0; i < Math.ceil(TARGET / BATCH); i++) {
        const pre = await servePost('/prescreen', { limit: BATCH, terms, rescore: true, cv: get().cv, targetSalary: get().profile.salary, needsSponsorship: get().profile.sponsorship });
        if (!pre || pre.ok === false) break;
        if (Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
        processed += Number(pre.checked) || 0;
        bump(Math.min(0.94, 0.1 + 0.84 * Math.min(1, processed / TARGET)));
        if (!pre.checked || pre.checked < BATCH) break;
      }
      bump(1);
    } catch {
      /* keep prior rows */
    }
    stopTick();
    set((s) => (s.busy === 'scan' ? { busy: null, progress: 0 } : {}));
  },

  // Intelligently grow the corpus: winc names companies for the intent, serve probes their ATS boards and
  // scans the verified ones; then we prescreen the newcomers (intent-relevant first) so they rank in place.
  discover: async () => {
    if (!get().intent.trim()) return;
    set({ busy: 'discover', progress: 0.08 });
    const stopTick = startTicker(set, get);
    const bump = (p: number) => set((s) => ({ progress: Math.max(s.progress, p) }));
    try {
      const r = await servePost('/discover', { intent: get().intent, regions: get().profile.regions, levels: get().profile.levels });
      if (r && r.ok && Array.isArray(r.rows)) set({ scored: rowsToScored(r.rows) });
      bump(0.5);
      const terms = get().searchTerms || undefined;
      for (let i = 0; i < 3; i++) {
        const pre = await servePost('/prescreen', { limit: 6, terms, cv: get().cv, targetSalary: get().profile.salary, needsSponsorship: get().profile.sponsorship });
        if (!pre || pre.ok === false) break;
        if (Array.isArray(pre.rows)) set({ scored: rowsToScored(pre.rows) });
        bump(Math.min(0.94, 0.5 + 0.15 * (i + 1)));
        if (!pre.checked || pre.checked < 6) break;
      }
      bump(1);
    } catch {
      /* discovery is best-effort (winc may be down) → keep prior rows */
    }
    stopTick();
    set((s) => (s.busy === 'discover' ? { busy: null, progress: 0 } : {}));
  },

  scoreOne: async (url) => {
    set({ busy: url });
    try {
      const cv = get().cv;
      const v = await servePost('/evaluate', { url, cv: cv || undefined, transferable: get().profile.transferable, targetSalary: get().profile.salary, needsSponsorship: get().profile.sponsorship });
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

  // Batch-eval the top-N most relevant unscored roles instead of one tap each. Bounded concurrency (pool 3)
  // keeps winc responsive; each result lands as it finishes so the list fills in progressively.
  scoreTopN: async (n) => {
    const queue = get().scored
      .filter((r) => r.confirm !== 'skip' && !get().verdicts[r.url])
      .slice(0, Math.max(1, n))
      .map((r) => r.url);
    if (!queue.length) return;
    set({ scoring: true });
    const POOL = 3;
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const url = queue[i++];
        await get().scoreOne(url);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
    } finally {
      set({ scoring: false });
    }
  },

  // A thumbs on a verdict is a human label. Persist it locally (survives reload) AND append to the serve
  // ledger so `jobfaro calibrate --feedback` can report where the eval disagrees with real users.
  rateVerdict: (url, thumb) => {
    set((s) => ({ feedback: { ...s.feedback, [url]: thumb } }));
    const v = get().verdicts[url];
    const row = get().scored.find((r) => r.url === url);
    servePost('/eval/feedback', {
      url, thumb, score: v && v.score, band: v && v.band,
      company: row && row.company, role: row && row.role,
    }).catch(() => {});
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
}), {
  name: 'jobfaro-app-v1',
  storage: createJSONStorage(() => stateStorage),
  // Persist only the user's own state (identity, choices, results) — NOT transient runtime flags. First
  // boot (no stored key) → the blank initial state; after a résumé/selection it's saved and restored.
  partialize: (s) => ({
    profile: s.profile, cv: s.cv, resumeFile: s.resumeFile,
    intent: s.intent, searchTerms: s.searchTerms, lastIntent: s.lastIntent, lastScope: s.lastScope,
    regionsUserSet: s.regionsUserSet, levelsUserSet: s.levelsUserSet, onboarded: s.onboarded,
    scored: s.scored, verdicts: s.verdicts, feedback: s.feedback, tailored: s.tailored, drafts: s.drafts, ledger: s.ledger,
  }),
}));

// Auto-pull live state from serve on launch (no-op if serve isn't up yet — the user can retry via scan).
useStore.getState().hydrate();
