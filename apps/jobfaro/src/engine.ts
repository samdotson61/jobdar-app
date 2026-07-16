// @jobfaro/app — UI types + derived-UI helpers (Phase 9.2). The app holds NO engine logic: it renders what
// `jobfaro serve` (the real CLI + winc) returns via src/serve.ts + src/store.ts. This file is only the shared
// types, the band thresholds/colors (from the real @jobfaro/engine — used purely for instant UI coloring),
// the cadence labels, and the bundled EN/ES strings. The old in-app scoring/tailoring stand-ins are gone.
import { band as engineBand, BANDS as ENGINE_BANDS } from '@jobfaro/engine';

export type Lang = 'en' | 'es';
export type Band = 'apply' | 'research' | 'dont';

export interface Profile { name: string; language: Lang; regions: string[]; levels: string[]; transferable: boolean; sponsorship: boolean; salary: number }
export interface Job { company: string; role: string; url: string; location: string; postedOn?: string; jd: string }
export interface Scored extends Job { prescreen: number; screenReason: string; gate?: string; confirm?: 'fit' | 'maybe' | 'skip'; level?: string; sponsors?: boolean }
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
    'onboard.title': 'Welcome to Jobfaro', 'onboard.intro': 'Find roles you can actually get. Your résumé and data stay on your machine.',
    'onboard.continueAs': 'Continue as', 'onboard.upload': '📄 Upload your résumé', 'onboard.manual': 'Or set your search manually:',
    'onboard.start': 'Start searching', 'onboard.skip': 'Skip for now',
    'search.title': 'Find roles that fit', 'search.intro': 'Describe what you want — winc + the scanner find and rank matching roles.',
    'search.intentPlaceholder': "Tell us what you're looking for (e.g. entry-level product manager, remote or Midwest)…",
    'search.resumeSaved': 'Using your saved résumé.', 'search.resumeNone': 'No résumé yet — upload one to sharpen ranking & enable scoring.',
    'search.emptyPrompt': 'Upload your résumé (or set filters) and tap "Find matching roles" to start.',
    'search.scan': 'Find matching roles', 'search.discover': '🧭 Discover more companies (winc)',
    'search.transferable': 'Credit transferable skills',
    'search.sponsorship': 'Need visa sponsorship', 'search.sponsors': '✓ Sponsors visa',
    // Signal-language, not verdicts: prescreen is keyword overlap + freshness — "fit" is the eval's word.
    'search.confirm.fit': 'Strong signals', 'search.confirm.maybe': 'Some signals', 'search.confirm.skip': 'Skip',
    'search.showMore': 'Show more ({n} remaining)',
    'search.backendDown': 'Can’t reach the backend. Start it in a terminal — `jobfaro serve` — then retry.',
    'search.modelMissing': 'The on-device AI model isn’t downloaded yet — scoring needs it (search works without it).',
    'common.retry': 'Retry', 'common.settings': 'Settings',
    'settings.title': 'Settings', 'settings.intro': 'Choose where Jobfaro’s engine runs and manage the on-device model. Your data stays on this device either way.',
    'settings.backend': 'Engine', 'settings.local': 'On-device (private, no computer needed)', 'settings.serve': 'My computer (jobfaro serve)',
    'settings.model': 'On-device model', 'settings.modelReady': '✓ {file} installed', 'settings.noModel': 'Download the model once (Wi-Fi recommended) and every evaluation runs privately on this phone.',
    'settings.download': '⬇︎ Download {size} GB', 'settings.downloaded': 'Model downloaded.', 'settings.recommended': 'recommended for this device',
    'settings.delete': 'Remove downloaded model', 'settings.serveHelp': 'Run `jobfaro serve --host 0.0.0.0` on your computer, then enter its address and token.',
    'settings.token': 'Bearer token', 'settings.save': 'Save & connect',
    'search.searchPlaceholder': 'Search company or role…', 'search.sort': 'Sort', 'filter.all': 'All',
    'sort.score': 'Best match', 'sort.fresh': 'Newest', 'sort.company': 'A–Z',
    'apply.title': 'Score & tailor', 'apply.score': 'Score this role', 'apply.tailor': 'Tailor CV + cover letter',
    'apply.band.apply': 'Apply', 'apply.band.research': 'Research', 'apply.band.dont': "Don't",
    'apply.directive': 'Steer it (e.g. warmer, shorter)…', 'apply.summary': 'Tailored summary',
    'apply.scoreTop': '⚡ Score top {n} matches', 'apply.scoring': 'Scoring…', 'apply.rate': 'Was this fit right?',
    'followup.title': 'Reach out', 'followup.person': 'Recipient name', 'followup.draft': 'Draft a note',
    'followup.cadence': 'Cadence: 2 contacts/role · 1 follow-up after 5 business days · hard stop',
    'followup.lint.ok': 'Passes checks — review, then send it yourself.',
    'common.region': 'Regions', 'common.level': 'Level', 'common.salary': 'Target salary', 'salary.any': 'Any', 'common.lang': 'Idioma: ES',
    'region.midwest': 'Midwest', 'region.northeast': 'Northeast', 'region.southeast': 'Southeast',
    'region.southwest': 'Southwest', 'region.west': 'West', 'region.nationwide': 'Nationwide',
    'level.entry': 'Entry', 'level.mid': 'Mid', 'level.senior': 'Senior',
    'common.demo': 'Runs privately on this device — or via your own computer (Settings).',
    'common.loadSample': 'Refresh', 'common.upload': 'Upload résumé',
    'common.binary': 'Paste your text or use a .txt for now.',
    'common.uploadFailed': 'Couldn’t read that file — try a .docx, a text PDF, or .txt.',
    'common.loaded': 'Loaded', 'common.pay': 'Pay',
  },
  es: {
    'tab.search': 'Buscar', 'tab.apply': 'Postular', 'tab.followup': 'Seguimiento',
    'onboard.title': 'Bienvenido a Jobfaro', 'onboard.intro': 'Encuentra empleos que sí puedes conseguir. Tu currículum y tus datos se quedan en tu equipo.',
    'onboard.continueAs': 'Continuar como', 'onboard.upload': '📄 Sube tu currículum', 'onboard.manual': 'O configura tu búsqueda manualmente:',
    'onboard.start': 'Empezar a buscar', 'onboard.skip': 'Omitir por ahora',
    'search.title': 'Encuentra empleos que encajan', 'search.intro': 'Describe lo que buscas — winc + el escáner encuentran y ordenan empleos que encajan.',
    'search.intentPlaceholder': 'Cuéntanos qué buscas (p. ej. gerente de producto nivel inicial, remoto o Midwest)…',
    'search.resumeSaved': 'Usando tu currículum guardado.', 'search.resumeNone': 'Aún sin currículum — sube uno para afinar el orden y habilitar la evaluación.',
    'search.emptyPrompt': 'Sube tu currículum (o elige filtros) y toca "Buscar empleos" para empezar.',
    'search.scan': 'Buscar empleos', 'search.discover': '🧭 Descubrir más empresas (winc)',
    'search.transferable': 'Acreditar habilidades transferibles',
    'search.sponsorship': 'Necesito patrocinio de visa', 'search.sponsors': '✓ Patrocina visa',
    'search.confirm.fit': 'Señales fuertes', 'search.confirm.maybe': 'Algunas señales', 'search.confirm.skip': 'Omitir',
    'search.showMore': 'Mostrar más ({n} restantes)',
    'search.backendDown': 'No se puede conectar con el backend. Inícialo en una terminal — `jobfaro serve` — y reintenta.',
    'search.modelMissing': 'El modelo de IA del dispositivo aún no está descargado — la evaluación lo necesita (la búsqueda funciona sin él).',
    'common.retry': 'Reintentar', 'common.settings': 'Ajustes',
    'settings.title': 'Ajustes', 'settings.intro': 'Elige dónde corre el motor de Jobfaro y gestiona el modelo del dispositivo. Tus datos se quedan en este dispositivo en ambos casos.',
    'settings.backend': 'Motor', 'settings.local': 'En el dispositivo (privado, sin computadora)', 'settings.serve': 'Mi computadora (jobfaro serve)',
    'settings.model': 'Modelo en el dispositivo', 'settings.modelReady': '✓ {file} instalado', 'settings.noModel': 'Descarga el modelo una vez (Wi-Fi recomendado) y cada evaluación corre en privado en este teléfono.',
    'settings.download': '⬇︎ Descargar {size} GB', 'settings.downloaded': 'Modelo descargado.', 'settings.recommended': 'recomendado para este dispositivo',
    'settings.delete': 'Eliminar el modelo descargado', 'settings.serveHelp': 'Ejecuta `jobfaro serve --host 0.0.0.0` en tu computadora y escribe su dirección y token.',
    'settings.token': 'Token de acceso', 'settings.save': 'Guardar y conectar',
    'search.searchPlaceholder': 'Buscar empresa o puesto…', 'search.sort': 'Orden', 'filter.all': 'Todos',
    'sort.score': 'Mejor', 'sort.fresh': 'Recientes', 'sort.company': 'A–Z',
    'apply.title': 'Evaluar y adaptar', 'apply.score': 'Evaluar este puesto', 'apply.tailor': 'Adaptar CV + carta',
    'apply.band.apply': 'Postula', 'apply.band.research': 'Investiga', 'apply.band.dont': 'No',
    'apply.directive': 'Guíalo (p. ej. más cálido, más corto)…', 'apply.summary': 'Resumen adaptado',
    'apply.scoreTop': '⚡ Evaluar las {n} mejores', 'apply.scoring': 'Evaluando…', 'apply.rate': '¿El encaje fue correcto?',
    'followup.title': 'Contacta', 'followup.person': 'Nombre del destinatario', 'followup.draft': 'Redactar nota',
    'followup.cadence': 'Cadencia: 2 contactos/puesto · 1 seguimiento tras 5 días hábiles · alto definitivo',
    'followup.lint.ok': 'Pasa las verificaciones — revísala y envíala tú mismo.',
    'common.region': 'Regiones', 'common.level': 'Nivel', 'common.salary': 'Salario objetivo', 'salary.any': 'Cualquiera', 'common.lang': 'Language: EN',
    'region.midwest': 'Medio Oeste', 'region.northeast': 'Noreste', 'region.southeast': 'Sureste',
    'region.southwest': 'Suroeste', 'region.west': 'Oeste', 'region.nationwide': 'Todo EE. UU.',
    'level.entry': 'Inicial', 'level.mid': 'Medio', 'level.senior': 'Senior',
    'common.demo': 'Corre en privado en este dispositivo — o vía tu propia computadora (Ajustes).',
    'common.loadSample': 'Actualizar', 'common.upload': 'Subir currículum',
    'common.binary': 'Pega tu texto o usa un .txt por ahora.',
    'common.uploadFailed': 'No se pudo leer ese archivo — prueba un .docx, un PDF con texto o un .txt.',
    'common.loaded': 'Cargado', 'common.pay': 'Salario',
  },
};
export const t = (lang: Lang, key: string, params?: Record<string, string | number>): string => {
  let s = STR[lang][key] ?? STR.en[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
};
