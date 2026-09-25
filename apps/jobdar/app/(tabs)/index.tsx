import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { router } from 'expo-router';
import { backendMode } from '@/src/serve';
import { useStore } from '@/src/store';
import { t, type Lang } from '@/src/engine';
import { relevanceScore, levelDecision, locationMatches, regionPriority, parseSalaryText } from '@jobdar/engine';
import { Btn, C, Card, Field, H, Pill, Sub, confirmColor } from '@/src/ui';

const REGION_OPTS = ['midwest', 'northeast', 'southeast', 'southwest', 'west', 'nationwide'];
const LEVEL_OPTS = ['entry', 'mid', 'senior'];

type SortKey = 'score' | 'fresh' | 'company';
type FilterKey = 'all' | 'fit' | 'maybe' | 'skip';


// Free-text salary target (1.22.1): "80k", "$80,000", "80000" — preset chips were needlessly
// restrictive. Parsed live with an honest echo; blank = any.
function SalaryInput({ lang, value, onSet }: { lang: Lang; value: number; onSet: (n: number) => void }) {
  const [txt, setTxt] = useState(value ? `${Math.round(value / 1000)}k` : '');
  const parsed = parseSalaryText(txt);
  return (
    <View>
      <Field
        placeholder={t(lang, 'salary.placeholder')}
        value={txt}
        onChangeText={(x: string) => { setTxt(x); const n = parseSalaryText(x); if (n !== null) onSet(n); }}
      />
      <Text style={{ color: parsed === null ? C.warn : C.dim, fontSize: 11, marginTop: 2 }}>
        {parsed === null ? t(lang, 'salary.bad') : parsed === 0 ? t(lang, 'salary.any') : t(lang, 'salary.parsed', { v: `$${Math.round(parsed / 1000)}k` })}
      </Text>
    </View>
  );
}

export default function Search() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const busy = useStore((s) => s.busy);
  const progress = useStore((s) => s.progress);
  const intent = useStore((s) => s.intent);
  const terms = useStore((s) => s.searchTerms);
  const cv = useStore((s) => s.cv);
  const resumeFile = useStore((s) => s.resumeFile);
  const onboarded = useStore((s) => s.onboarded);
  const savedProfileName = useStore((s) => s.savedProfileName);
  const serveUp = useStore((s) => s.serveUp);
  const modelUp = useStore((s) => s.modelUp);
  const { uploadResume, runSearch, discover, toggleTransferable, toggleSponsorship, toggleRegion, toggleLevel, setSalary, setIntent, setOnboarded, continueAsSaved, hydrate } = useStore.getState();
  const lang = profile.language;
  const [msg, setMsg] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [filter, setFilter] = useState<FilterKey>('all');
  // Pagination: long pipelines (hundreds of rows) render in pages of 30; any view change resets to page 1.
  const [shown, setShown] = useState(30);
  useEffect(() => { setShown(30); }, [query, filter, sortBy, terms]);

  // Search + filter + sort the live rows. When an intent has been parsed, the list is RANKED by relevance
  // to what the user asked for and roles irrelevant to it are cut (an explicit fit is always kept).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = !!terms && (((terms.keywords?.length ?? 0) > 0) || ((terms.titles?.length ?? 0) > 0));
    const rel = (j: any) => (active ? relevanceScore(`${j.role} ${j.company} ${j.location}`, terms) : 0);
    let rows = scored.filter((j) => !q || `${j.role} ${j.company} ${j.location}`.toLowerCase().includes(q));
    // Honor the selected region + level live (the same engine filters the scan uses), so tuning the scope
    // narrows the list instantly; the next "Find matching roles" re-scans to pull in more for that scope.
    rows = rows.filter((j) =>
      (profile.levels.length === 0 || levelDecision(j.role, profile.levels).include) &&
      (profile.regions.length === 0 || locationMatches(j.location, profile.regions)));
    if (active && terms?.fromResume) {
      // Résumé-mode default view shows ONLY plausible rows: real title relevance, or winc's fit/maybe.
      // AI-skips stay one tap away under the Skip filter WITH their reasons (honest, not hidden) —
      // stale "Strong signals" chips alone no longer buy a spot (that's how Inside Sales outranked IT).
      if (filter === 'skip') rows = rows.filter((j) => j.aiConfirm === 'skip' || (j.confirm ?? 'skip') === 'skip');
      else rows = rows.filter((j) => j.aiConfirm !== 'skip' && (rel(j) > 0 || j.aiConfirm === 'fit' || j.aiConfirm === 'maybe'));
    }
    else if (active) rows = rows.filter((j) => rel(j) > 0 || j.confirm === 'fit'); // cut roles irrelevant to the intent
    if (filter !== 'all') rows = rows.filter((j) => (j.confirm ?? 'skip') === filter);
    // Best-match order leads with region timezone priority (in-region first, out-of-timezone remote last —
    // a "remote out of Columbus" role no longer floats to the top when "West" is selected), then intent
    // relevance, then the fit tier (the prescreen score stays internal — it's only a hidden tiebreak now).
    const pr = (j: any) => regionPriority(j.location, profile.regions);
    const fitRank = (j: any) => (j.confirm === 'fit' ? 2 : j.confirm === 'maybe' ? 1 : 0);
    const out = [...rows];
    if (sortBy === 'fresh') out.sort((a, b) => String(b.postedOn || '').localeCompare(String(a.postedOn || '')));
    else if (sortBy === 'company') out.sort((a, b) => a.company.localeCompare(b.company));
    // Résumé-derived terms (1.22.1): rank by RELEVANCE TIERS — a title-phrase or multi-keyword match
    // (rel ≥ 2.5) first, any real match next, zero-relevance rows last NO MATTER their prescreen chip
    // (those chips can be stale generic-overlap scores, which is exactly how customer-service roles
    // "outranked" IT ones). Within a tier, fit + fresh prescreen order honestly. Typed intent keeps
    // its own words-first ordering below.
    else if (terms?.fromResume) {
      const relTier = (j: any) => { const r = rel(j); return r >= 2.5 ? 2 : r > 0 ? 1 : 0; };
      // winc's semantic verdict leads when present (fit above everything, skip below everything) —
      // word overlap can't tell "Inside Sales" from "Desktop Support" for an IT résumé; the model can.
      const aiRank = (j: any) => (j.aiConfirm === 'fit' ? 2 : j.aiConfirm === 'maybe' ? 1 : j.aiConfirm === 'skip' ? -1 : 0);
      out.sort((a, b) =>
        pr(b) - pr(a) ||
        Number(Boolean(a.gate)) - Number(Boolean(b.gate)) ||
        aiRank(b) - aiRank(a) ||
        relTier(b) - relTier(a) ||
        rel(b) - rel(a) ||
        fitRank(b) - fitRank(a) ||
        b.prescreen - a.prescreen);
    }
    else out.sort((a, b) =>
      pr(b) - pr(a) ||
      (active ? rel(b) - rel(a) : 0) ||
      Number(Boolean(a.gate)) - Number(Boolean(b.gate)) ||
      fitRank(b) - fitRank(a) ||
      b.prescreen - a.prescreen);
    return out;
  }, [scored, query, sortBy, filter, terms, profile.regions, profile.levels]);

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/rtf'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setMsg('');
      // Read the picked file's BYTES → base64 and let serve parse it (docx via unzip, pdf via pdftotext,
      // txt direct). Same result on both platforms, different readers: web fetches the blob: URI (the
      // FileSystem File API is native-only); native reads via expo-file-system (fetch(file://) is flaky).
      let base64 = '';
      if (Platform.OS === 'web') {
        const buf = await (await fetch(asset.uri)).arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (typeof btoa !== 'function') { setMsg(t(lang, 'common.binary')); return; }
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
        base64 = btoa(bin);
      } else {
        base64 = await new FsFile(asset.uri).base64();
      }
      const r = await uploadResume(asset.name, base64); // persists the extracted text + re-ranks
      if (!r.ok) setMsg(t(lang, 'common.uploadFailed'));   // honest: say it couldn't be read (e.g. scanned PDF)
      else {
        setOnboarded(true); // a successful upload completes onboarding → into Search
        // Show what the résumé rebuilt (1.22.0) and open the preferences fold for confirmation —
        // the person sees exactly what was detected, what applied, and that their own picks win.
        const d = r.detected || {};
        const place = d.location || (d.region ? t(lang, `region.${d.region}`) : '');
        const lvl = d.level ? t(lang, `level.${d.level}`) : '';
        const parts = [d.name, place, lvl].filter(Boolean).join(' · ');
        let note = parts ? t(lang, 'search.detected', { parts }) : t(lang, 'search.detectedNone');
        if (r.clearedVerdicts) note += '  ' + t(lang, 'search.staleScores', { n: r.clearedVerdicts });
        setMsg(note);
        setFiltersOpen(true);
      }
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };

  const Chip = ({ label, active, on, color }: { label: string; active: boolean; on: () => void; color: string }) => (
    <Pressable onPress={on}>
      <Pill label={label} color={active ? color : C.chip} text={active ? color : C.dim} />
    </Pressable>
  );

  // Honest backend status. serve mode: unreachable façade → say so with the command + Retry. local
  // (on-device) mode: the façade is the app itself, so the only gap is the model — search works without
  // it, scoring doesn't; point at Settings to download it once.
  const localMode = backendMode() === 'local';
  const backendBanner = !serveUp ? (
    <Card style={{ borderColor: C.warn }}>
      <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t(lang, 'search.backendDown')}</Text>
      <Btn kind="ghost" label={t(lang, 'common.retry')} onPress={hydrate} />
    </Card>
  ) : localMode && !modelUp ? (
    <Card style={{ borderColor: C.warn }}>
      <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t(lang, 'search.modelMissing')}</Text>
      <Btn kind="ghost" label={t(lang, 'common.settings')} onPress={() => router.push('/settings' as any)} />
    </Card>
  ) : null;

  // First-run onboarding (shown until the user uploads a résumé, makes a choice, or skips). A genuine first
  // boot has onboarded:false; it persists once dismissed. Offers "continue as <name>" if a saved CLI profile
  // exists (cross-device restore), an upload, or a manual region/level/salary setup.
  if (!onboarded) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
        <H>{t(lang, 'onboard.title')}</H>
        <Sub>{t(lang, 'onboard.intro')}</Sub>
        {backendBanner}
        <Card>
          {savedProfileName ? (
            <Btn label={`${t(lang, 'onboard.continueAs')} ${savedProfileName}`} onPress={continueAsSaved} />
          ) : null}
          <Btn kind={savedProfileName ? 'ghost' : 'primary'} label={t(lang, 'onboard.upload')} onPress={onUpload} />
          {msg ? <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{msg}</Text> : null}

          <Text style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>{t(lang, 'onboard.manual')}</Text>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.region')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
            {REGION_OPTS.map((r) => (<Chip key={r} label={t(lang, `region.${r}`)} active={profile.regions.includes(r)} on={() => toggleRegion(r)} color={C.tint} />))}
          </View>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.level')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
            {LEVEL_OPTS.map((l) => (<Chip key={l} label={t(lang, `level.${l}`)} active={profile.levels.includes(l)} on={() => toggleLevel(l)} color={C.tint} />))}
            <Chip label={t(lang, 'search.sponsorship')} active={profile.sponsorship} on={toggleSponsorship} color={C.good} />
          </View>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.salary')}</Text>
          <SalaryInput lang={lang} value={profile.salary || 0} onSet={setSalary} />

          <Btn label={t(lang, 'onboard.start')} onPress={() => { setOnboarded(true); runSearch(); }} />
          <Btn kind="ghost" label={t(lang, 'onboard.skip')} onPress={() => setOnboarded(true)} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'search.title')}</H>
      <Pressable onPress={() => router.push('/settings' as any)} style={{ position: 'absolute', right: 16, top: 18 }} hitSlop={10}>
        <Text style={{ color: C.dim, fontSize: 18 }}>⚙︎</Text>
      </Pressable>
      <Sub>{t(lang, 'search.intro')}</Sub>
      {backendBanner}

      <Card>
        <Field
          multiline
          placeholder={t(lang, 'search.intentPlaceholder')}
          value={intent}
          onChangeText={setIntent}
          style={{ minHeight: 58 }}
        />
        {/* What a good ask looks like (1.22.0): a one-line recipe + tappable real examples that fill
            the box — nobody should have to guess what to type to get a good search. */}
        {!intent.trim() ? (
          <View>
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>{t(lang, 'search.intentRecipe')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
              {(['ex1', 'ex2', 'ex3'] as const).map((k) => (
                <Pressable key={k} onPress={() => setIntent(t(lang, `search.${k}`))}>
                  <Pill label={t(lang, `search.${k}`)} color={C.tint} text={C.dim} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1, flexBasis: 130 }}><Btn kind="ghost" label={`📄 ${t(lang, 'common.upload')}`} onPress={onUpload} /></View>
        </View>
        {/* Honest status: green ✓ ONLY for a résumé the user actually uploaded this session; a pre-existing
            saved résumé is disclosed neutrally (not a green "loaded" the user didn't trigger); else prompt. */}
        <Text style={{ color: msg ? C.dim : resumeFile ? C.good : C.dim, fontSize: 12, marginTop: 6 }}>
          {msg || (resumeFile ? `✓ ${resumeFile}` : cv ? t(lang, 'search.resumeSaved') : t(lang, 'search.resumeNone'))}
        </Text>

        {/* Scope summary + fold (1.21.0 calm-down): the chip groups (region/level/salary) collapse
            behind a one-line readout of the CURRENT selections — the values stay visible, the three
            rows of chips only appear when the person is actually changing them. */}
        <Pressable onPress={() => setFiltersOpen((x) => !x)} hitSlop={6} style={{ marginTop: 8 }}>
          <Text style={{ color: C.dim, fontSize: 12 }}>
            {profile.regions.map((r) => t(lang, `region.${r}`)).join(' · ') || t(lang, 'region.midwest')}
            {' — '}{profile.levels.map((l) => t(lang, `level.${l}`)).join(' · ')}
            {' — '}{(profile.salary || 0) === 0 ? t(lang, 'salary.any') : `$${Math.round((profile.salary || 0) / 1000)}k+`}
            {'   '}<Text style={{ color: C.tint, fontWeight: '600' }}>{filtersOpen ? `${t(lang, 'search.filtersHide')} ▴` : `${t(lang, 'search.filtersShow')} ▾`}</Text>
          </Text>
        </Pressable>

        {filtersOpen ? (<View>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>{t(lang, 'common.region')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
          {REGION_OPTS.map((r) => (
            <Chip key={r} label={t(lang, `region.${r}`)} active={profile.regions.includes(r)} on={() => toggleRegion(r)} color={C.tint} />
          ))}
        </View>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.level')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
          {LEVEL_OPTS.map((l) => (
            <Chip key={l} label={t(lang, `level.${l}`)} active={profile.levels.includes(l)} on={() => toggleLevel(l)} color={C.tint} />
          ))}
          <Pressable onPress={toggleTransferable}>
            <Pill
              label={`${t(lang, 'search.transferable')} ${profile.transferable ? '✓' : '○'}`}
              color={profile.transferable ? C.good : C.chip}
              text={profile.transferable ? C.good : C.dim}
            />
          </Pressable>
          {/* "I need visa sponsorship" — a status only the user can assert. On: explicit no-sponsorship
              JDs screen out (quoted), explicit sponsors get a ✓; silent JDs stay untouched (honesty). */}
          <Pressable onPress={toggleSponsorship}>
            <Pill
              label={`${t(lang, 'search.sponsorship')} ${profile.sponsorship ? '✓' : '○'}`}
              color={profile.sponsorship ? C.good : C.chip}
              text={profile.sponsorship ? C.good : C.dim}
            />
          </Pressable>
        </View>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.salary')}</Text>
        <SalaryInput lang={lang} value={profile.salary || 0} onSet={setSalary} />
        {profile.name ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}><Pill label={`👤 ${profile.name}`} color={C.tint} text={C.tint} /></View> : null}
        </View>) : null}
        <Btn
          label={t(lang, 'search.scan')}
          onPress={runSearch}
          disabled={busy === 'scan'}
          progress={busy === 'scan' ? Math.max(0.04, progress) : undefined}
        />
        <Btn
          kind="ghost"
          label={t(lang, 'search.discover')}
          onPress={discover}
          disabled={!intent.trim() || busy != null}
          progress={busy === 'discover' ? Math.max(0.08, progress) : undefined}
        />
        {/* Honest-UI (1.21.1): a disabled control explains itself — discovery needs the intent text
            above to know WHAT to hunt for, and nothing said so. */}
        {!intent.trim() ? (
          <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginTop: 4 }}>{t(lang, 'search.discoverHint')}</Text>
        ) : null}
      </Card>

      {/* search + sort + filter — the list auto-ranks by relevance/score, stays searchable/filterable */}
      <Field placeholder={t(lang, 'search.searchPlaceholder')} value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
        <Text style={{ color: C.dim, fontSize: 12, marginRight: 4 }}>{t(lang, 'search.sort')}:</Text>
        {(['score', 'fresh', 'company'] as SortKey[]).map((k) => (
          <Chip key={k} label={t(lang, `sort.${k}`)} active={sortBy === k} on={() => setSortBy(k)} color={C.tint} />
        ))}
        <Text style={{ color: C.dim, fontSize: 12, marginLeft: 'auto' }}>{visible.length}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
        {(['all', 'fit', 'maybe', 'skip'] as FilterKey[]).map((f) => (
          <Chip key={f} label={f === 'all' ? t(lang, 'filter.all') : t(lang, `search.confirm.${f}`)} active={filter === f} on={() => setFilter(f)} color={f === 'all' ? C.tint : confirmColor(f)} />
        ))}
      </View>
      {/* Triage summary (1.22.1): what winc concluded, in one honest line — and when the boards hold
          little in the person's lane, SAY so and point at Discover instead of padding the list. */}
      {terms?.fromResume ? (() => {
        const ai = scored.filter((j) => j.aiConfirm);
        if (!ai.length) return null;
        const f2 = ai.filter((j) => j.aiConfirm === 'fit').length;
        const m2 = ai.filter((j) => j.aiConfirm === 'maybe').length;
        return (
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {t(lang, 'search.aiSummary', { n: ai.length, fit: f2, maybe: m2, skip: ai.length - f2 - m2 })}
            {f2 === 0 ? `  ${t(lang, 'search.aiNone')}` : ''}
          </Text>
        );
      })() : null}

      {visible.slice(0, shown).map((j) => (
        <Card key={j.url}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
          <Text style={{ color: C.dim, marginBottom: 2 }}>{j.company} · {j.location}{j.postedOn ? ` · ${j.postedOn}` : ''}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {/* Score is reserved for the evaluation (Apply) stage — Search shows only the fit indicator. */}
            <Pill label={t(lang, `search.confirm.${j.confirm}`)} color={confirmColor(j.confirm)} text={confirmColor(j.confirm)} />
            {/* winc's semantic read (1.22.1) — shown with its reason, so the ranking explains itself. */}
            {j.aiConfirm ? <Pill label={`🤖 ${t(lang, `search.ai.${j.aiConfirm}`)}${j.aiReason ? ` — ${j.aiReason}` : ''}`} color={confirmColor(j.aiConfirm)} text={confirmColor(j.aiConfirm)} /> : null}
            {j.sponsors ? <Pill label={t(lang, 'search.sponsors')} color={C.good} text={C.good} /> : null}
            {j.gate ? <Pill label={`⛔ ${j.gate}`} color={C.bad} text={C.bad} /> : null}
          </View>
          <Text style={{ color: C.dim, marginTop: 6, fontSize: 12 }}>{j.screenReason}</Text>
        </Card>
      ))}
      {visible.length > shown ? (
        <Btn kind="ghost" label={t(lang, 'search.showMore', { n: visible.length - shown })} onPress={() => setShown((s) => s + 30)} />
      ) : null}
      {visible.length === 0 ? <Sub>{t(lang, 'search.emptyPrompt')}</Sub> : null}
    </ScrollView>
  );
}
