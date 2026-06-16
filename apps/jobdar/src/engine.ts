// @jobdar/app — UI types + derived-UI helpers (Phase 9.2). The app holds NO engine logic: it renders what
// `jobdar serve` (the real CLI + winc) returns via src/serve.ts + src/store.ts. This file is only the shared
// types, the band thresholds/colors (from the real @jobdar/engine — used purely for instant UI coloring),
// the cadence labels, and the bundled EN/ES strings. The old in-app scoring/tailoring stand-ins are gone.
import { band as engineBand, BANDS as ENGINE_BANDS } from '@jobdar/engine';

export type Lang = 'en' | 'es';
export type Band = 'apply' | 'research' | 'dont';

export interface Profile { name: string; language: Lang; regions: string[]; levels: string[]; transferable: boolean }
export interface Job { company: string; role: string; url: string; location: string; postedOn?: string; jd: string }
export interface Scored extends Job { prescreen: number; screenReason: string; gate?: string; confirm?: 'fit' | 'maybe' | 'skip'; level?: string }
export interface Criterion { key: string; weight: number; judgment: 'strong' | 'partial' | 'none'; evidence: string }
export interface Verdict { score: number; band: Band; criteria: Criterion[]; pay: string; clamped?: string }
export interface Tailored { summary: string; coverLetter: string; keywords: string[] }
export interface Draft { message: string; problems: string[] }

export const BANDS = ENGINE_BANDS as { apply: number; research: number };
export const band = (score: number): Band => (engineBand(score) || 'dont') as Band;
export const CADENCE = { maxContactsPerRole: 2, followupAfterBusinessDays: 5, maxFollowupsPerPerson: 1 } as const;

// ── i18n (EN/ES parity, bundled) ─────────────────────────────────────────────
type Dict = Record<string, string>;
const STR: Record<Lang, Dict> = {
  en: {
    'tab.search': 'Search', 'tab.apply': 'Apply', 'tab.followup': 'Follow-up',
    'search.title': 'Find roles that fit', 'search.intro': 'Describe what you want — winc + the scanner find and rank matching roles.',
    'search.intentPlaceholder': "Tell us what you're looking for (e.g. entry-level product manager, remote or Midwest)…",
    'search.resumeLoaded': 'Résumé loaded — used to rank, score & tailor.', 'search.resumeNone': 'No résumé yet — upload one to sharpen ranking & enable scoring.',
    'search.scan': 'Find matching roles', 'search.transferable': 'Credit transferable skills',
    'search.confirm.fit': 'Likely fit', 'search.confirm.maybe': 'Worth a look', 'search.confirm.skip': 'Skip',
    'search.searchPlaceholder': 'Search company or role…', 'search.sort': 'Sort', 'filter.all': 'All',
    'sort.score': 'Score', 'sort.fresh': 'Newest', 'sort.company': 'A–Z',
    'apply.title': 'Score & tailor', 'apply.score': 'Score this role', 'apply.tailor': 'Tailor CV + cover letter',
    'apply.band.apply': 'Apply', 'apply.band.research': 'Research', 'apply.band.dont': "Don't",
    'apply.directive': 'Steer it (e.g. warmer, shorter)…', 'apply.summary': 'Tailored summary',
    'followup.title': 'Reach out', 'followup.person': 'Recipient name', 'followup.draft': 'Draft a note',
    'followup.cadence': 'Cadence: 2 contacts/role · 1 follow-up after 5 business days · hard stop',
    'followup.lint.ok': 'Passes checks — review, then send it yourself.',
    'common.region': 'Region', 'common.level': 'Level', 'common.lang': 'Idioma: ES',
    'common.demo': 'Live from your local jobdar serve — the CLI + winc are the engine.',
    'common.loadSample': 'Refresh', 'common.upload': 'Upload résumé',
    'common.binary': 'Paste your text or use a .txt for now.',
    'common.loaded': 'Loaded', 'common.pay': 'Pay',
  },
  es: {
    'tab.search': 'Buscar', 'tab.apply': 'Postular', 'tab.followup': 'Seguimiento',
    'search.title': 'Encuentra empleos que encajan', 'search.intro': 'Describe lo que buscas — winc + el escáner encuentran y ordenan empleos que encajan.',
    'search.intentPlaceholder': 'Cuéntanos qué buscas (p. ej. gerente de producto nivel inicial, remoto o Midwest)…',
    'search.resumeLoaded': 'Currículum cargado — se usa para ordenar, evaluar y adaptar.', 'search.resumeNone': 'Aún sin currículum — sube uno para afinar el orden y habilitar la evaluación.',
    'search.scan': 'Buscar empleos', 'search.transferable': 'Acreditar habilidades transferibles',
    'search.confirm.fit': 'Buen encaje', 'search.confirm.maybe': 'Vale la pena', 'search.confirm.skip': 'Omitir',
    'search.searchPlaceholder': 'Buscar empresa o puesto…', 'search.sort': 'Orden', 'filter.all': 'Todos',
    'sort.score': 'Puntaje', 'sort.fresh': 'Recientes', 'sort.company': 'A–Z',
    'apply.title': 'Evaluar y adaptar', 'apply.score': 'Evaluar este puesto', 'apply.tailor': 'Adaptar CV + carta',
    'apply.band.apply': 'Postula', 'apply.band.research': 'Investiga', 'apply.band.dont': 'No',
    'apply.directive': 'Guíalo (p. ej. más cálido, más corto)…', 'apply.summary': 'Resumen adaptado',
    'followup.title': 'Contacta', 'followup.person': 'Nombre del destinatario', 'followup.draft': 'Redactar nota',
    'followup.cadence': 'Cadencia: 2 contactos/puesto · 1 seguimiento tras 5 días hábiles · alto definitivo',
    'followup.lint.ok': 'Pasa las verificaciones — revísala y envíala tú mismo.',
    'common.region': 'Región', 'common.level': 'Nivel', 'common.lang': 'Language: EN',
    'common.demo': 'En vivo desde tu jobdar serve local — el CLI + winc son el motor.',
    'common.loadSample': 'Actualizar', 'common.upload': 'Subir currículum',
    'common.binary': 'Pega tu texto o usa un .txt por ahora.',
    'common.loaded': 'Cargado', 'common.pay': 'Salario',
  },
};
export const t = (lang: Lang, key: string): string => STR[lang][key] ?? STR.en[key] ?? key;
