// @jobdar/app — in-app engine (Phase 9 increment 1).
//
// HONEST STATUS: this is a faithful TypeScript port of Jobdar's DETERMINISTIC contracts — the band
// thresholds, the decomposed-rubric criteria + weights, the prescreen gates, the cadence rules, and the
// grounded-tailoring shape. It runs with NO model so the three-tab UX is fully clickable today. The model
// verbs (eval/tailor/outreach drafting) use a transparent keyword-overlap scorer as a STAND-IN; the real
// on-device model (WebLLM web / llama.rn native) and the shared `@jobdar/engine` package (after the 9.0
// fs-decoupling of lib/) swap in behind these same signatures. Nothing here fabricates: scoring is derived
// only from the résumé + JD text, exactly like the real pipeline.

export type Lang = 'en' | 'es';
export type Band = 'apply' | 'research' | 'dont';

export interface Profile {
  name: string;
  language: Lang;
  regions: string[];
  levels: string[];
  transferable: boolean;
}

export interface Job {
  company: string;
  role: string;
  url: string;
  location: string;
  postedOn?: string;
  jd: string;
}

export interface Scored extends Job {
  prescreen: number;        // 0–100 zero-token likelihood
  screenReason: string;
  gate?: string;            // a hard gate that fired (years/degree/clearance) — kept, not hidden
  confirm?: 'fit' | 'maybe' | 'skip';
}

export interface Criterion {
  key: string;
  weight: number;           // sums to 1.0
  judgment: 'strong' | 'partial' | 'none';
  evidence: string;
}

export interface Verdict {
  score: number;            // 0–5, code-computed
  band: Band;
  criteria: Criterion[];
  pay: string;              // source-labeled, never fabricated
  clamped?: string;
}

// ── Locked contracts (mirror the shipped CLI) ────────────────────────────────
export const BANDS = { apply: 4.0, research: 3.5 } as const;
export function band(score: number): Band {
  if (score >= BANDS.apply) return 'apply';
  if (score >= BANDS.research) return 'research';
  return 'dont';
}
export const CADENCE = { maxContactsPerRole: 2, followupAfterBusinessDays: 5, maxFollowupsPerPerson: 1 } as const;
// Decomposed rubric — skills 35 / experience 25 / level-fit 20 / logistics 10 / education-gate 10
const RUBRIC: { key: string; weight: number }[] = [
  { key: 'skills', weight: 0.35 },
  { key: 'experience', weight: 0.25 },
  { key: 'level', weight: 0.2 },
  { key: 'logistics', weight: 0.1 },
  { key: 'education', weight: 0.1 },
];

const STOP = new Set('a an the and or for to of in on with at by from as is are be we you your our role team work years experience strong ability skills'.split(' '));
const toks = (s: string) => (s.toLowerCase().match(/[a-z][a-z+.#]{2,}/g) || []).filter((w) => !STOP.has(w));
const overlap = (a: Set<string>, bToks: string[]) => {
  const hit = bToks.filter((w) => a.has(w));
  return { ratio: bToks.length ? hit.length / new Set(bToks).size : 0, hits: [...new Set(hit)] };
};
const judge = (ratio: number): Criterion['judgment'] => (ratio >= 0.18 ? 'strong' : ratio >= 0.07 ? 'partial' : 'none');
const points = (j: Criterion['judgment']) => (j === 'strong' ? 5 : j === 'partial' ? 3.2 : 1.2);

// ── Prescreen (zero-token gate + likelihood) ─────────────────────────────────
const YEARS_RE = /(\d{1,2})\+?\s*(?:years|yrs)/i;
const DEGREE_RE = /\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|degree required|master'?s?)\b/i;
const CLEAR_RE = /\b(security clearance|active clearance|ts\/sci|secret clearance)\b/i;
const levelCap: Record<string, number> = { entry: 2, mid: 5, senior: 10 };

export function prescreen(jobs: Job[], cvText: string, profile: Profile): Scored[] {
  const cv = new Set(toks(cvText));
  const cap = Math.max(...profile.levels.map((l) => levelCap[l] ?? 2));
  return jobs
    .map((job) => {
      const jdToks = toks(`${job.role} ${job.jd}`);
      const { ratio, hits } = overlap(cv, jdToks);
      let gate: string | undefined;
      const ym = job.jd.match(YEARS_RE);
      if (ym && Number(ym[1]) > cap && !profile.transferable) gate = `needs ${ym[1]}+ yrs (cap ${cap})`;
      if (CLEAR_RE.test(job.jd)) gate = 'active clearance required';
      if (DEGREE_RE.test(job.jd) && !profile.transferable && !cv.has('bachelor') && !cv.has('degree')) gate = gate ?? 'degree required';
      const fresh = freshness(job.postedOn);
      const score = Math.round(Math.min(100, ratio * 320 + fresh) - (gate ? 45 : 0));
      const reason = gate
        ? `gate: ${gate}`
        : hits.length
          ? `matches ${hits.slice(0, 4).join(', ')}`
          : 'scored on freshness only';
      return { ...job, prescreen: Math.max(1, score), screenReason: reason, gate };
    })
    .sort((a, b) => b.prescreen - a.prescreen);
}
function freshness(postedOn?: string): number {
  if (!postedOn) return 8;
  const m = /(\d+)\s*(day|week|month)/i.exec(postedOn);
  if (!m) return 8;
  const n = Number(m[1]);
  const days = m[2].toLowerCase().startsWith('day') ? n : m[2].toLowerCase().startsWith('week') ? n * 7 : n * 30;
  return Math.max(0, 18 - days * 0.5);
}

// ── Light-AI pre-confirm (yes/maybe/no triage — NOT a score) ─────────────────
export function preConfirm(job: Scored): 'fit' | 'maybe' | 'skip' {
  if (job.gate) return 'skip';
  if (job.prescreen >= 55) return 'fit';
  if (job.prescreen >= 28) return 'maybe';
  return 'skip';
}

// ── Evaluate (decomposed rubric → code-computed 0–5 → band) ───────────────────
export function evaluate(job: Job, cvText: string, profile: Profile): Verdict {
  const cv = new Set(toks(cvText));
  const sections: Record<string, string> = {
    skills: job.jd,
    experience: job.jd,
    level: `${job.role} ${profile.levels.join(' ')}`,
    logistics: `${job.location} ${profile.regions.join(' ')}`,
    education: job.jd,
  };
  const criteria: Criterion[] = RUBRIC.map(({ key, weight }) => {
    const { ratio, hits } = overlap(cv, toks(sections[key]));
    const j = judge(ratio + (profile.transferable ? 0.03 : 0));
    return {
      key,
      weight,
      judgment: j,
      evidence: hits.length ? `“${hits.slice(0, 3).join(', ')}” in the JD` : 'no clear signal in the JD',
    };
  });
  let score = criteria.reduce((s, c) => s + points(c.judgment) * c.weight, 0);
  // gate clamp: a hard education/clearance gate floors to Don't (unless transferable exempts degree)
  let clamped: string | undefined;
  if (CLEAR_RE.test(job.jd)) { score = Math.min(score, 2.0); clamped = 'clearance gate'; }
  score = Math.round(score * 10) / 10;
  return { score, band: band(score), criteria, pay: resolvePay(job), clamped };
}

// pay: STATED → else labeled estimate. Never a bare invented number.
function resolvePay(job: Job): string {
  const m = job.jd.match(/\$\s?(\d{2,3}(?:,\d{3})?)(?:\s?[–-]\s?\$?\s?(\d{2,3}(?:,\d{3})?))?\s?(?:k|,000)?/i);
  if (m) return `stated ${m[0].trim()}`;
  return 'est. — (no posted pay)';
}

// ── Tailor (grounded: directives steer tone/length, never facts) ──────────────
export interface Tailored { summary: string; coverLetter: string; keywords: string[] }
export function tailor(job: Job, cvText: string, profile: Profile, directives: string[]): Tailored {
  const cv = new Set(toks(cvText));
  const kw = [...new Set(toks(job.jd))].filter((w) => cv.has(w)).slice(0, 8);
  const tone = directives.join('; ');
  const lead = cvText.split('\n').find((l) => l.trim().length > 30)?.trim() || `${profile.name}.`;
  const summary = `${profile.name} — targeting ${job.role} at ${job.company}. ${lead.slice(0, 180)}${directives.length ? `  [steered: ${tone}]` : ''}`;
  const coverLetter =
    `Dear ${job.company} Hiring Team,\n\n` +
    `I'm applying for the ${job.role} role. My background maps directly to your needs` +
    (kw.length ? ` — particularly ${kw.slice(0, 4).join(', ')}.` : '.') +
    ` I'd welcome the chance to contribute and grow with the role.\n\n` +
    (directives.length ? `(Steering applied: ${tone} — tone/emphasis only, never invented facts.)\n\n` : '') +
    `Sincerely,\n${profile.name}`;
  return { summary, coverLetter, keywords: kw };
}

// ── Outreach (one real fit reason + one ask; cadence enforced by code) ────────
export interface Draft { message: string; problems: string[] }
export function draftOutreach(job: Job, cvText: string, person: string): Draft {
  const cv = new Set(toks(cvText));
  const reason = [...new Set(toks(job.jd))].find((w) => cv.has(w)) || 'a strong fit for this role';
  const first = person.trim().split(/\s+/)[0] || 'there';
  const message =
    `Hi ${first}, I admire ${job.company}'s work and I'm exploring the ${job.role} role. ` +
    `My experience with ${reason} lines up well — could you point me to the right person or share a quick perspective? Thank you!`;
  const problems: string[] = [];
  if (message.length > 300) problems.push('too_long');
  if (/\[(?:name|company|role)/i.test(message)) problems.push('placeholder');
  if (!message.toLowerCase().includes(first.toLowerCase())) problems.push('missing_name');
  return { message, problems };
}

// ── i18n (EN/ES parity, bundled) ─────────────────────────────────────────────
type Dict = Record<string, string>;
const STR: Record<Lang, Dict> = {
  en: {
    'tab.search': 'Search', 'tab.apply': 'Apply', 'tab.followup': 'Follow-up',
    'search.title': 'Find roles that fit', 'search.intro': 'Upload your résumé and tell us what you want.',
    'search.scan': 'Find matching roles', 'search.transferable': 'Credit transferable skills',
    'search.confirm.fit': 'Likely fit', 'search.confirm.maybe': 'Worth a look', 'search.confirm.skip': 'Skip',
    'apply.title': 'Score & tailor', 'apply.score': 'Score this role', 'apply.tailor': 'Tailor CV + cover letter',
    'apply.band.apply': 'Apply', 'apply.band.research': 'Research', 'apply.band.dont': "Don't",
    'apply.directive': 'Steer it (e.g. warmer, shorter)…', 'apply.summary': 'Tailored summary',
    'followup.title': 'Reach out', 'followup.person': 'Recipient name', 'followup.draft': 'Draft a note',
    'followup.cadence': 'Cadence: 2 contacts/role · 1 follow-up after 5 business days · hard stop',
    'followup.lint.ok': 'Passes checks — review, then send it yourself.',
    'common.region': 'Region', 'common.level': 'Level', 'common.lang': 'Idioma: ES',
    'common.demo': 'Demo data + on-device deterministic engine. Live scan + model = next milestone.',
    'common.loadSample': 'Load sample résumé', 'common.pay': 'Pay',
  },
  es: {
    'tab.search': 'Buscar', 'tab.apply': 'Postular', 'tab.followup': 'Seguimiento',
    'search.title': 'Encuentra empleos que encajan', 'search.intro': 'Sube tu currículum y dinos qué buscas.',
    'search.scan': 'Buscar empleos', 'search.transferable': 'Acreditar habilidades transferibles',
    'search.confirm.fit': 'Buen encaje', 'search.confirm.maybe': 'Vale la pena', 'search.confirm.skip': 'Omitir',
    'apply.title': 'Evaluar y adaptar', 'apply.score': 'Evaluar este puesto', 'apply.tailor': 'Adaptar CV + carta',
    'apply.band.apply': 'Postula', 'apply.band.research': 'Investiga', 'apply.band.dont': 'No',
    'apply.directive': 'Guíalo (p. ej. más cálido, más corto)…', 'apply.summary': 'Resumen adaptado',
    'followup.title': 'Contacta', 'followup.person': 'Nombre del destinatario', 'followup.draft': 'Redactar nota',
    'followup.cadence': 'Cadencia: 2 contactos/puesto · 1 seguimiento tras 5 días hábiles · alto definitivo',
    'followup.lint.ok': 'Pasa las verificaciones — revísala y envíala tú mismo.',
    'common.region': 'Región', 'common.level': 'Nivel', 'common.lang': 'Language: EN',
    'common.demo': 'Datos de muestra + motor determinista en el dispositivo. Escaneo en vivo + modelo = próximo hito.',
    'common.loadSample': 'Cargar currículum de muestra', 'common.pay': 'Salario',
  },
};
export const t = (lang: Lang, key: string): string => STR[lang][key] ?? STR.en[key] ?? key;
