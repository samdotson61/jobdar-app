// @jobdar/app — UI types + derived-UI helpers (Phase 9.2). The app holds NO engine logic: it renders what
// `jobdar serve` (the real CLI + winc) returns via src/serve.ts + src/store.ts. This file is only the shared
// types, the band thresholds/colors (from the real @jobdar/engine — used purely for instant UI coloring),
// the cadence labels, and the bundled EN/ES strings. The old in-app scoring/tailoring stand-ins are gone.
import { band as engineBand, BANDS as ENGINE_BANDS } from '@jobdar/engine';

export type Lang = 'en' | 'es';
export type Band = 'apply' | 'research' | 'dont';

export interface Profile { name: string; language: Lang; regions: string[]; levels: string[]; transferable: boolean; sponsorship: boolean; salary: number }
export interface Job { company: string; role: string; url: string; location: string; postedOn?: string; jd: string }
export interface Scored extends Job { prescreen: number; screenReason: string; gate?: string; confirm?: 'fit' | 'maybe' | 'skip'; level?: string; sponsors?: boolean; listingGone?: boolean; aiConfirm?: 'fit' | 'maybe' | 'skip'; aiReason?: string }
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
    'onboard.title': 'Welcome to Jobdar', 'onboard.intro': 'Find roles you can actually get. Your résumé and data stay on your machine.',
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
    'search.ai.fit': 'good fit', 'search.ai.maybe': 'worth a look', 'search.ai.skip': 'not your lane',
    'search.aiSummary': '🤖 winc read the top {n} against your résumé: {fit} good fit(s) · {maybe} worth a look · {skip} not your lane (under Skip).', 'search.aiNone': 'Slim pickings on these boards — tap 🧭 Discover to hunt employers in your field.',
    'search.showMore': 'Show more ({n} remaining)',
    'search.backendDown': 'Can’t reach the backend. Start it in a terminal — `jobdar serve` — then retry.',
    'search.modelMissing': 'The on-device AI model isn’t downloaded yet — scoring needs it (search works without it).',
    'common.retry': 'Retry', 'common.settings': 'Settings',
    'settings.title': 'Settings', 'settings.intro': 'Choose where Jobdar’s engine runs and manage the on-device model. Your data stays on this device either way.',
    'settings.backend': 'Engine', 'settings.local': 'On-device (private, no computer needed)', 'settings.serve': 'My computer (jobdar serve)',
    'settings.model': 'On-device model', 'settings.modelReady': '✓ {file} installed', 'settings.noModel': 'Download the model once (Wi-Fi recommended) and every evaluation runs privately on this phone.',
    'settings.download': '⬇︎ Download {size} GB', 'settings.downloaded': 'Model downloaded.', 'settings.recommended': 'recommended for this device',
    'settings.delete': 'Remove downloaded model', 'settings.serveHelp': 'Run `jobdar serve --host 0.0.0.0` on your computer, then enter its address and token.',
    'settings.token': 'Bearer token', 'settings.save': 'Save & connect',
    'search.searchPlaceholder': 'Search company or role…', 'search.sort': 'Sort', 'filter.all': 'All',
    'sort.score': 'Best match', 'sort.fresh': 'Newest', 'sort.company': 'A–Z',
    'apply.title': 'Score & tailor', 'apply.score': 'Score this role', 'apply.tailor': 'Tailor CV + cover letter',
    'apply.band.apply': 'Apply', 'apply.band.research': 'Research', 'apply.band.dont': "Don't",
    'apply.directive': 'Steer it (e.g. warmer, shorter)…', 'apply.summary': 'Tailored summary',
    'apply.scoreTop': '⚡ Score top {n} matches', 'apply.scoring': 'Scoring…', 'apply.rate': 'Would you apply to this role?',
    'apply.wouldApply': "👍 I'd apply", 'apply.wouldnt': '👎 Not for me', 'apply.exportReport': '📄 Export beta report', 'apply.exporting': 'Building report…',
    'apply.gone': 'No longer posted', 'apply.notVerified': 'Fit is scored from the listing text — the employer itself isn’t verified.',
    'apply.recheck': '🔎 Re-check listings', 'apply.rechecking': 'Re-checking…',
    'apply.showWhy': 'Why this score', 'apply.hideWhy': 'Hide details',
    'search.filtersShow': 'Adjust', 'search.filtersHide': 'Done',
    'search.discoverHint': 'Describe what you want above and Discover unlocks — it uses your words to hunt for more company boards.',
    'salary.placeholder': 'Target salary — e.g. 80k or $80,000 (blank = any)', 'salary.parsed': 'Target: {v}+ — stated pay 25%+ under this screens out, with the numbers shown', 'salary.bad': "Couldn't read that — try 80k or 80000",
    'search.detected': 'From your résumé: {parts}. Check your preferences below — your own picks always win.',
    'search.detectedNone': 'Résumé saved. Set your region and level below so the search knows where to look.',
    'search.staleScores': '{n} previous score(s) were for your old résumé and were cleared — re-score in Apply.',
    'search.intentRecipe': 'Works best with: the kind of work + level + where + any must-haves. Tap an example:',
    'search.ex1': 'entry level office coordinator or scheduling near Columbus, no weekends',
    'search.ex2': 'customer support or help desk, remote in the Midwest, bilingual Spanish a plus',
    'search.ex3': 'warehouse team lead moving into operations coordinator, Cincinnati area',
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
    'onboard.title': 'Bienvenido a Jobdar', 'onboard.intro': 'Encuentra empleos que sí puedes conseguir. Tu currículum y tus datos se quedan en tu equipo.',
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
    'search.ai.fit': 'buen encaje', 'search.ai.maybe': 'vale la pena mirar', 'search.ai.skip': 'no es tu área',
    'search.aiSummary': '🤖 winc leyó los {n} mejores frente a tu currículum: {fit} buen(os) encaje(s) · {maybe} vale la pena mirar · {skip} no es tu área (en Omitir).', 'search.aiNone': 'Poca cosecha en estos portales — toca 🧭 Descubrir para buscar empleadores de tu campo.',
    'search.showMore': 'Mostrar más ({n} restantes)',
    'search.backendDown': 'No se puede conectar con el backend. Inícialo en una terminal — `jobdar serve` — y reintenta.',
    'search.modelMissing': 'El modelo de IA del dispositivo aún no está descargado — la evaluación lo necesita (la búsqueda funciona sin él).',
    'common.retry': 'Reintentar', 'common.settings': 'Ajustes',
    'settings.title': 'Ajustes', 'settings.intro': 'Elige dónde corre el motor de Jobdar y gestiona el modelo del dispositivo. Tus datos se quedan en este dispositivo en ambos casos.',
    'settings.backend': 'Motor', 'settings.local': 'En el dispositivo (privado, sin computadora)', 'settings.serve': 'Mi computadora (jobdar serve)',
    'settings.model': 'Modelo en el dispositivo', 'settings.modelReady': '✓ {file} instalado', 'settings.noModel': 'Descarga el modelo una vez (Wi-Fi recomendado) y cada evaluación corre en privado en este teléfono.',
    'settings.download': '⬇︎ Descargar {size} GB', 'settings.downloaded': 'Modelo descargado.', 'settings.recommended': 'recomendado para este dispositivo',
    'settings.delete': 'Eliminar el modelo descargado', 'settings.serveHelp': 'Ejecuta `jobdar serve --host 0.0.0.0` en tu computadora y escribe su dirección y token.',
    'settings.token': 'Token de acceso', 'settings.save': 'Guardar y conectar',
    'search.searchPlaceholder': 'Buscar empresa o puesto…', 'search.sort': 'Orden', 'filter.all': 'Todos',
    'sort.score': 'Mejor', 'sort.fresh': 'Recientes', 'sort.company': 'A–Z',
    'apply.title': 'Evaluar y adaptar', 'apply.score': 'Evaluar este puesto', 'apply.tailor': 'Adaptar CV + carta',
    'apply.band.apply': 'Postula', 'apply.band.research': 'Investiga', 'apply.band.dont': 'No',
    'apply.directive': 'Guíalo (p. ej. más cálido, más corto)…', 'apply.summary': 'Resumen adaptado',
    'apply.scoreTop': '⚡ Evaluar las {n} mejores', 'apply.scoring': 'Evaluando…', 'apply.rate': '¿Postularías a este puesto?',
    'apply.wouldApply': '👍 Postularía', 'apply.wouldnt': '👎 No es para mí', 'apply.exportReport': '📄 Exportar informe beta', 'apply.exporting': 'Generando informe…',
    'apply.gone': 'Ya no publicado', 'apply.notVerified': 'El ajuste se puntúa con el texto del anuncio — el empleador en sí no se verifica.',
    'apply.recheck': '🔎 Verificar puestos', 'apply.rechecking': 'Verificando…',
    'apply.showWhy': 'Por qué esta puntuación', 'apply.hideWhy': 'Ocultar detalles',
    'search.filtersShow': 'Ajustar', 'search.filtersHide': 'Listo',
    'search.discoverHint': 'Describe arriba lo que buscas y Descubrir se activa — usa tus palabras para buscar más portales de empresas.',
    'salary.placeholder': 'Salario objetivo — p. ej. 80k o $80,000 (en blanco = cualquiera)', 'salary.parsed': 'Objetivo: {v}+ — un salario publicado 25%+ por debajo se descarta, mostrando las cifras', 'salary.bad': 'No se pudo leer — prueba 80k u 80000',
    'search.detected': 'De tu currículum: {parts}. Revisa tus preferencias abajo — tus propias elecciones siempre ganan.',
    'search.detectedNone': 'Currículum guardado. Configura tu región y nivel abajo para que la búsqueda sepa dónde mirar.',
    'search.staleScores': '{n} puntuación(es) anteriores eran de tu currículum viejo y se borraron — vuelve a puntuar en Postular.',
    'search.intentRecipe': 'Funciona mejor con: el tipo de trabajo + nivel + dónde + requisitos imprescindibles. Toca un ejemplo:',
    'search.ex1': 'coordinación de oficina o agenda, nivel inicial, cerca de Columbus, sin fines de semana',
    'search.ex2': 'atención al cliente o soporte técnico, remoto en el Medio Oeste, bilingüe español',
    'search.ex3': 'líder de equipo de almacén pasando a coordinación de operaciones, zona de Cincinnati',
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
