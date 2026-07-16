// The ON-DEVICE backend (Phase 10) — implements the SAME endpoint surface `jobfaro serve` exposes, with
// the same response shapes, so src/serve.ts can route every store action here untouched. The engine
// logic is the real @jobfaro/engine (identical to the CLI); storage is src/local/files.ts; the model is
// llama.rn via src/local/llm (greedy + grammar-JSON — the winc eval profile). No network leaves the
// device except the scanners fetching PUBLIC job boards and the one-time model download.
// @ts-ignore — the engine is plain JS
import {
  resolveProvider, fetchJobDescription, filterByLevel, filterByLocation,
  mergeScanned, recordPrescreen, recordEval, parsePipeline, serializePipeline,
  prescreenRole, reasonLine, paySummary, relevanceScore, expandQueryTerms,
  prepEval, buildVerdict, evalSystemFor, EVAL_JSON_SCHEMA,
  TAILOR_SYSTEM, buildTailorUser, TAILOR_JSON_SCHEMA, parseEvalJson, coverIsComplete, fillSignature, assembleTailoredCv, directiveBlock,
  OUTREACH_SYSTEM, buildOutreachUser, OUTREACH_JSON_SCHEMA, lintDraft, canContact, canFollowup, LINKEDIN_NOTE_MAX,
  SEED_EMPLOYERS, seedToPortals, stripTags, decodeEntities,
} from '@jobfaro/engine';
import { unzipSync, strFromU8 } from 'fflate';
import { readText, writeText, readJson, writeJson, FILES } from './files';
import { installedTier, completionJson, llmAvailable } from './llm';

const today = () => new Date().toISOString().slice(0, 10);

// ---- profile (the device's equivalent of config/profile.yml; CLI key names on purpose) ----
type LocalProfile = {
  name: string; language: string; location: string;
  target_regions: string[]; target_levels: string[]; tuning_profile: string;
  transferable_skills: boolean; needs_sponsorship: boolean; target_salary: number;
};
const PROFILE_FALLBACK: LocalProfile = {
  name: '', language: 'en', location: '', target_regions: [], target_levels: [],
  tuning_profile: 'new_grad', transferable_skills: true, needs_sponsorship: false, target_salary: 0,
};
const readProfile = () => readJson<LocalProfile>(FILES.profile, PROFILE_FALLBACK);

// ---- pipeline ----
const readPipe = async () => parsePipeline(await readText(FILES.pipeline));
const writePipe = (rows: any[]) => writeText(FILES.pipeline, serializePipeline(rows));

// ---- small concurrency pool (phone radios: keep it lower than the Mac's) ----
async function pool<T>(items: T[], width: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const worker = async () => { while (queue.length) await run(queue.shift() as T); };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
}

// ---- résumé bytes → text (L5: docx via fflate, txt/md direct; PDF deferred with the honest error) ----
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('not a docx');
  const xml = strFromU8(doc);
  const withBreaks = xml.replace(/<w:(p|br|tab)[ />]/g, '\n<');
  return decodeEntities(stripTags(withBreaks)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Deterministic identity fields (the serve path can also use the model; on-device stays code-only).
function extractFields(text: string): { name?: string; location?: string } {
  const lines = String(text || '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
  const name = lines[0] && lines[0].length <= 60 && !/@|http|\d{3}/.test(lines[0]) ? lines[0] : undefined;
  const loc = String(text || '').match(/\b([A-Z][a-zA-Z .]+,\s*(?:[A-Z]{2}|Ohio|Texas|Illinois|Indiana|Michigan|Missouri|Kansas|Iowa|Wisconsin|Minnesota|Kentucky|Georgia|Florida|California|Washington|Oregon|Colorado|Arizona|Nevada|Utah))\b/);
  return { name, location: loc ? loc[1] : undefined };
}

// ---- feedback ledger (same TSV cols as the CLI's data/eval_feedback.tsv, de-dup by url) ----
const FEEDBACK_COLS = ['url', 'company', 'role', 'score', 'band', 'thumb', 'date'];
async function appendFeedback(entry: Record<string, any>): Promise<void> {
  const esc = (v: any) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ');
  const text = await readText(FILES.feedback);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: Record<string, string>[] = [];
  if (lines.length > 1) {
    const header = lines[0].split('\t');
    for (const line of lines.slice(1)) {
      const cells = line.split('\t');
      const row: Record<string, string> = {};
      header.forEach((h, i) => (row[h] = cells[i] ?? ''));
      if (row.url !== entry.url) rows.push(row);
    }
  }
  rows.push(entry);
  await writeText(FILES.feedback, [FEEDBACK_COLS.join('\t'), ...rows.map((r) => FEEDBACK_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n');
}

// ---- outreach ledger ----
const OUTREACH_COLS = ['company', 'url', 'person', 'title', 'channel', 'kind', 'date', 'note'];
async function readLedger(): Promise<Record<string, string>[]> {
  const text = await readText(FILES.outreach);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= 1) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

// ---- the dispatcher ----
export async function localCall(path: string, method: 'GET' | 'POST', body: any): Promise<any> {
  const p = body || {};
  try {
    if (path === '/health') {
      const tier = llmAvailable() ? await installedTier() : null;
      return { ok: true, engine: 'on-device', backend: { kind: 'local-embedded', runtime: 'llama.rn', up: !!tier, model: tier ? tier.file : '' } };
    }

    if (path === '/pipeline' && method === 'GET') {
      const rows = await readPipe();
      return { ok: true, count: rows.length, rows };
    }

    if (path === '/profile' && method === 'GET') return await readProfile();
    if (path === '/profile' && method === 'POST') {
      const cur = await readProfile();
      const patch: Partial<LocalProfile> = {};
      if (typeof p.name === 'string') patch.name = p.name.slice(0, 120);
      if (typeof p.location === 'string') patch.location = p.location.slice(0, 120);
      if (Array.isArray(p.target_regions)) patch.target_regions = p.target_regions.filter((r: any) => typeof r === 'string').slice(0, 8);
      if (Array.isArray(p.target_levels)) patch.target_levels = p.target_levels.filter((l: any) => ['entry', 'mid', 'senior'].includes(l));
      if (p.target_salary != null && Number.isFinite(Number(p.target_salary))) patch.target_salary = Number(p.target_salary);
      if (typeof p.transferable_skills === 'boolean') patch.transferable_skills = p.transferable_skills;
      if (typeof p.needs_sponsorship === 'boolean') patch.needs_sponsorship = p.needs_sponsorship;
      if (p.language === 'en' || p.language === 'es') patch.language = p.language;
      const saved = { ...cur, ...patch };
      await writeJson(FILES.profile, saved);
      return { ok: true, saved };
    }

    if (path === '/cv' && method === 'GET') {
      const content = await readText(FILES.cv);
      return { loaded: !!content.trim(), content };
    }
    if (path === '/cv' && method === 'POST') {
      await writeText(FILES.cv, String(p.content || ''));
      return { ok: true };
    }

    if (path === '/import/upload') {
      if (typeof p.base64 !== 'string' || !p.base64) return { ok: false, status: 400, error: 'base64 required' };
      const safe = (String(p.name || 'resume').split(/[/\\]/).pop() || 'resume').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'resume';
      const ext = (safe.split('.').pop() || '').toLowerCase();
      let text = '';
      try {
        if (ext === 'docx') text = docxText(base64ToBytes(p.base64));
        else if (ext === 'txt' || ext === 'md') text = decodeEntities(atob(p.base64));
        else if (ext === 'pdf') return { ok: false, status: 400, error: 'PDF import isn’t supported on-device yet — export your résumé as .docx or .txt', ext, name: safe };
        else return { ok: false, status: 400, error: 'could not read this file', ext, name: safe };
      } catch (e: any) {
        return { ok: false, status: 400, error: String(e?.message || 'could not read this file'), ext, name: safe };
      }
      if (!text.trim()) return { ok: false, status: 400, error: 'could not read this file', ext, name: safe };
      await writeText(FILES.cv, text);
      return { ok: true, name: safe, ext, length: text.length, text, fields: extractFields(text) };
    }

    if (path === '/search/parse') {
      // Deterministic keyword expansion (the engine's designed winc-down degrade path). An on-device
      // model intent parse is a later slice — the source field stays honest.
      return { ok: true, ...expandQueryTerms(String(p.intent || '')), source: 'keywords' };
    }

    if (path === '/scan') {
      const profile = await readProfile();
      const regions: string[] = Array.isArray(p.regions) && p.regions.length ? p.regions : profile.target_regions.length ? profile.target_regions : ['nationwide'];
      const levels: string[] = Array.isArray(p.levels) && p.levels.length ? p.levels : profile.target_levels.length ? profile.target_levels : ['entry', 'mid', 'senior'];
      let portals = await readJson<any[]>(FILES.portals, []);
      if (!portals.length) {
        const all = regions.includes('nationwide');
        const employers = (SEED_EMPLOYERS as any[]).filter((e) => all || regions.includes(String(e.region || '')));
        portals = seedToPortals(employers.length ? employers : (SEED_EMPLOYERS as any[]));
        await writeJson(FILES.portals, portals);
      }
      const kept: any[] = [];
      let excludedLevel = 0, excludedRegion = 0, resolved = 0;
      await pool(portals, 4, async (portal) => {
        const hit = resolveProvider(portal);
        if (!hit) return;
        resolved++;
        try {
          const jobs = await hit.provider.fetch(hit.match, {});
          const lvl = filterByLevel(jobs, levels);
          const loc = filterByLocation(lvl.kept, regions, { userMetro: profile.location });
          for (const j of loc.kept) kept.push(j);
          excludedLevel += lvl.excluded;
          excludedRegion += loc.excluded;
        } catch { /* one slow/broken board never kills the scan */ }
      });
      const rows = mergeScanned(await readPipe(), kept, today());
      await writePipe(rows);
      return { ok: true, found: kept.length, excludedLevel, excludedRegion, portals: resolved, rows };
    }

    if (path === '/prescreen') {
      const profile = await readProfile();
      const cv = typeof p.cv === 'string' ? p.cv : await readText(FILES.cv);
      const prof: any = { ...profile };
      if (Number.isFinite(Number(p.targetSalary))) prof.target_salary = Number(p.targetSalary);
      if (typeof p.needsSponsorship === 'boolean') prof.needs_sponsorship = p.needsSponsorship;
      const date = today();
      const limit = Number(p.limit) > 0 ? Number(p.limit) : 12;
      const rescore = p.rescore === true;
      let all = await readPipe();
      let rows = all.filter((r: any) => r.url && !(String(r.score || '').trim() && r.status !== 'scanned') && (r.status === 'scanned' || r.status === 'evaluated') && (rescore || !String(r.prescreen || '').trim()));
      const terms = p.terms && typeof p.terms === 'object' ? p.terms : null;
      if (terms && ((terms.keywords && terms.keywords.length) || (terms.titles && terms.titles.length))) {
        rows = rows
          .map((r: any, i: number) => ({ r, i, rel: relevanceScore(`${r.role} ${r.company} ${r.location}`, terms) }))
          .filter((x: any) => x.rel >= 0)
          .sort((a: any, b: any) => b.rel - a.rel || a.i - b.i)
          .map((x: any) => x.r);
      }
      rows = rows.slice(0, limit);
      let screened = 0, ranked = 0;
      const updates: any[] = [];
      await pool(rows, 4, async (row: any) => {
        let jdText = '';
        try {
          const jd = await fetchJobDescription(row.url);
          jdText = (jd && jd.description) || '';
        } catch { /* unreachable JD → floored below, never a crash */ }
        const v = prescreenRole({ jdText, cvText: cv, title: row.role, posted: row.posted, firstSeen: row.first_seen, today: date, profile: prof });
        const dead = !v.screened && !v.jdAvailable;
        const reason = v.screened ? reasonLine(v.reasons, null) : dead ? 'listing expired — can’t assess fit' : '';
        const score = dead ? 8 : v.score;
        const pay = paySummary(v.pay, Number(prof.target_salary) || 0);
        const notes = v.sponsors ? 'sponsors-visa' : v.jdAvailable ? '' : undefined;
        updates.push({ url: row.url, score, reason, pay, notes });
        v.screened || dead ? screened++ : ranked++;
      });
      for (const u of updates) {
        const out = recordPrescreen(all, u.url, { score: u.score, reason: u.reason, pay: u.pay, notes: u.notes }, date);
        if (out) all = out;
      }
      await writePipe(all);
      return { ok: true, checked: rows.length, screened, ranked, rows: all };
    }

    if (path === '/evaluate') {
      if (!llmAvailable() || !(await installedTier())) return { ok: false, status: 503, error: 'backend not ready', reason: 'no-model' };
      const profile = await readProfile();
      let jd = p.jd || '';
      let title = '';
      if (!jd && p.url) {
        try {
          const d = await fetchJobDescription(p.url);
          jd = (d && d.description) || '';
          title = (d && d.title) || '';
        } catch { /* handled by the empty-JD guard */ }
      }
      if (!String(jd).trim()) return { ok: true, skipped: true, score: null, band: '', recommendation: "Job description unavailable — can't assess fit (the listing may have expired or be JS-rendered)." };
      const evalProfile: any = { ...profile };
      if (Number.isFinite(Number(p.targetSalary))) evalProfile.target_salary = Number(p.targetSalary);
      if (typeof p.needsSponsorship === 'boolean') evalProfile.needs_sponsorship = p.needsSponsorship;
      const cv = typeof p.cv === 'string' && p.cv ? p.cv : await readText(FILES.cv);
      // Résumé-blind guard (mirrors the empty-JD guard): with no résumé the model FABRICATES one and
      // returns a confident-but-meaningless Apply. Refuse honestly instead.
      if (!String(cv).trim()) return { ok: true, skipped: true, score: null, band: '', recommendation: 'No résumé on file — upload one first so fit can be judged against your real experience.' };
      const transferable = typeof p.transferable === 'boolean' ? p.transferable : Boolean(evalProfile.transferable_skills);
      const { gates, decision, user } = prepEval({ jd, cv, profile: evalProfile, today: today(), title });
      const r = await completionJson({ system: evalSystemFor(transferable), user, schema: EVAL_JSON_SCHEMA, maxTokens: 1024 });
      return buildVerdict({ text: r.text, jd, gates, decision, profile: evalProfile, transferable, model: r.model, backend: 'local-embedded', runtime: 'llama.rn' });
    }

    if (path === '/eval/save') {
      if (!p.url || !Number.isFinite(Number(p.score))) return { ok: false, status: 400, error: 'url + finite score required' };
      const rows = recordEval(await readPipe(), { url: p.url, score: p.score, band: p.band, recommendation: p.recommendation, company: p.company, role: p.role, location: p.location }, today());
      await writePipe(rows);
      return { ok: true };
    }

    if (path === '/eval/feedback') {
      if (!p.url || (p.thumb !== 'up' && p.thumb !== 'down')) return { ok: false, status: 400, error: 'url and thumb (up|down) required' };
      await appendFeedback({ url: p.url, company: p.company || '', role: p.role || '', score: p.score != null ? p.score : '', band: p.band || '', thumb: p.thumb, date: today() });
      return { ok: true };
    }

    if (path === '/tailor') {
      if (!llmAvailable() || !(await installedTier())) return { ok: false, status: 503, error: 'backend not ready', reason: 'no-model' };
      const profile = await readProfile();
      const cv = typeof p.cv === 'string' && p.cv ? p.cv : await readText(FILES.cv);
      if (!String(cv).trim()) return { ok: false, error: 'no résumé on file — upload one first' };
      let jd = p.jd || '';
      let role = '', company = '';
      if (!jd && p.url) {
        try {
          const d = await fetchJobDescription(p.url);
          jd = (d && d.description) || '';
          role = (d && d.title) || '';
        } catch { /* empty-JD guard below */ }
      }
      if (!String(jd).trim()) return { ok: false, error: 'job description unavailable' };
      const user = buildTailorUser({ jd, cv, profile, role, company });
      const directives = Array.isArray(p.directives) ? p.directives : [];
      let r = await completionJson({ system: TAILOR_SYSTEM + directiveBlock(directives), user, schema: TAILOR_JSON_SCHEMA, maxTokens: 900 });
      let j = parseEvalJson(r.text);
      if (!j || !coverIsComplete(j.cover_letter)) {
        r = await completionJson({ system: TAILOR_SYSTEM + directiveBlock(directives) + '\n\nYour LAST cover letter was incomplete. Write a COMPLETE short letter with a proper closing.', user, schema: TAILOR_JSON_SCHEMA, maxTokens: 900 });
        j = parseEvalJson(r.text) || j;
      }
      if (!j) return { ok: false, error: 'model returned unparseable output' };
      const coverLetter = fillSignature(String(j.cover_letter || ''), profile.name);
      return { ok: true, summary: String(j.summary || ''), coverLetter, keywords: Array.isArray(j.keywords) ? j.keywords : [], tailoredCv: assembleTailoredCv(cv, String(j.summary || '')) };
    }

    if (path === '/outreach/draft') {
      if (!llmAvailable() || !(await installedTier())) return { ok: false, status: 503, error: 'backend not ready', reason: 'no-model' };
      const profile = await readProfile();
      const cv = typeof p.cv === 'string' && p.cv ? p.cv : await readText(FILES.cv);
      if (!String(cv).trim()) return { ok: false, error: 'no résumé on file — upload one first' };
      const person = String(p.person || '');
      const channel = p.channel === 'email' ? 'email' : 'linkedin';
      let jd = '', role = '', company = '';
      if (p.url) {
        try {
          const d = await fetchJobDescription(p.url);
          jd = (d && d.description) || '';
          role = (d && d.title) || '';
        } catch { /* drafting still works from the résumé side */ }
      }
      const sys = OUTREACH_SYSTEM + (channel === 'linkedin' ? ` Keep the message under ${LINKEDIN_NOTE_MAX} characters (a LinkedIn connection note).` : '');
      const user = buildOutreachUser({ jd, cv, profile, role, company, person, channel });
      const r = await completionJson({ system: sys, user, schema: OUTREACH_JSON_SCHEMA, maxTokens: 400 });
      const j = parseEvalJson(r.text);
      const message = fillSignature(String((j && j.message) || '').trim(), profile.name);
      if (!message) return { ok: false, error: 'model returned an empty note' };
      const lint = lintDraft(message, { channel, person });
      return { ok: true, note: message, problems: lint.problems || [] };
    }

    if (path === '/outreach/log') {
      const entries = await readLedger();
      const kind = p.kind === 'followup' ? 'followup' : 'contact';
      const verdict = kind === 'contact' ? canContact(entries, { url: p.url, person: p.person }) : canFollowup(entries, { url: p.url, person: p.person, today: today() });
      if (!verdict.ok) return { ok: false, reason: verdict.reason };
      const esc = (v: any) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ');
      const entry: Record<string, string> = { company: p.company || '', url: p.url || '', person: p.person || '', title: p.title || '', channel: p.channel || 'linkedin', kind, date: today(), note: '' };
      const rows = [...entries, entry];
      await writeText(FILES.outreach, [OUTREACH_COLS.join('\t'), ...rows.map((r) => OUTREACH_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n');
      return { ok: true };
    }

    if (path === '/discover') {
      // Company discovery needs the intent model + portal persistence — a later on-device slice. Honest.
      return { ok: false, error: 'company discovery isn’t available on-device yet' };
    }

    return { ok: false, status: 404, error: 'not found', path };
  } catch (e: any) {
    return { ok: false, status: 500, error: String(e?.message || e) };
  }
}
