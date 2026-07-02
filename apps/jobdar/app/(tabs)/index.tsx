import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { relevanceScore, levelDecision, locationMatches, regionPriority } from '@jobdar/engine';
import { Btn, C, Card, Field, H, Pill, Sub, confirmColor } from '@/src/ui';

const REGION_OPTS = ['midwest', 'northeast', 'southeast', 'southwest', 'west', 'nationwide'];
const LEVEL_OPTS = ['entry', 'mid', 'senior'];
const SALARY_OPTS = [0, 40000, 60000, 80000, 100000, 120000]; // 0 = Any

type SortKey = 'score' | 'fresh' | 'company';
type FilterKey = 'all' | 'fit' | 'maybe' | 'skip';

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
  const { uploadResume, runSearch, discover, toggleTransferable, toggleRegion, toggleLevel, setSalary, setIntent, setOnboarded, continueAsSaved } = useStore.getState();
  const lang = profile.language;
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [filter, setFilter] = useState<FilterKey>('all');

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
    if (active) rows = rows.filter((j) => rel(j) > 0 || j.confirm === 'fit'); // cut roles irrelevant to the intent
    if (filter !== 'all') rows = rows.filter((j) => (j.confirm ?? 'skip') === filter);
    // Best-match order leads with region timezone priority (in-region first, out-of-timezone remote last —
    // a "remote out of Columbus" role no longer floats to the top when "West" is selected), then intent
    // relevance, then the fit tier (the prescreen score stays internal — it's only a hidden tiebreak now).
    const pr = (j: any) => regionPriority(j.location, profile.regions);
    const fitRank = (j: any) => (j.confirm === 'fit' ? 2 : j.confirm === 'maybe' ? 1 : 0);
    const out = [...rows];
    if (sortBy === 'fresh') out.sort((a, b) => String(b.postedOn || '').localeCompare(String(a.postedOn || '')));
    else if (sortBy === 'company') out.sort((a, b) => a.company.localeCompare(b.company));
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
      // Read the picked file's BYTES → base64 and let serve parse it (docx via unzip, pdf via pdftotext, txt direct).
      const buf = await (await fetch(asset.uri)).arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (typeof btoa !== 'function') { setMsg(t(lang, 'common.binary')); return; }
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
      const r = await uploadResume(asset.name, btoa(bin)); // persists the extracted text + re-ranks
      if (!r.ok) setMsg(t(lang, 'common.uploadFailed'));   // honest: say it couldn't be read (e.g. scanned PDF)
      else setOnboarded(true);                             // a successful upload completes onboarding → into Search
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };

  const Chip = ({ label, active, on, color }: { label: string; active: boolean; on: () => void; color: string }) => (
    <Pressable onPress={on}>
      <Pill label={label} color={active ? color : C.chip} text={active ? color : C.dim} />
    </Pressable>
  );

  // First-run onboarding (shown until the user uploads a résumé, makes a choice, or skips). A genuine first
  // boot has onboarded:false; it persists once dismissed. Offers "continue as <name>" if a saved CLI profile
  // exists (cross-device restore), an upload, or a manual region/level/salary setup.
  if (!onboarded) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
        <H>{t(lang, 'onboard.title')}</H>
        <Sub>{t(lang, 'onboard.intro')}</Sub>
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
          </View>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.salary')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
            {SALARY_OPTS.map((n) => (<Chip key={n} label={n === 0 ? t(lang, 'salary.any') : `$${Math.round(n / 1000)}k`} active={(profile.salary || 0) === n} on={() => setSalary(n)} color={C.tint} />))}
          </View>

          <Btn label={t(lang, 'onboard.start')} onPress={() => { setOnboarded(true); runSearch(); }} />
          <Btn kind="ghost" label={t(lang, 'onboard.skip')} onPress={() => setOnboarded(true)} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'search.title')}</H>
      <Sub>{t(lang, 'search.intro')}</Sub>

      <Card>
        <Field
          multiline
          placeholder={t(lang, 'search.intentPlaceholder')}
          value={intent}
          onChangeText={setIntent}
          style={{ minHeight: 58 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1, flexBasis: 130 }}><Btn kind="ghost" label={`📄 ${t(lang, 'common.upload')}`} onPress={onUpload} /></View>
        </View>
        {/* Honest status: green ✓ ONLY for a résumé the user actually uploaded this session; a pre-existing
            saved résumé is disclosed neutrally (not a green "loaded" the user didn't trigger); else prompt. */}
        <Text style={{ color: msg ? C.dim : resumeFile ? C.good : C.dim, fontSize: 12, marginTop: 6 }}>
          {msg || (resumeFile ? `✓ ${resumeFile}` : cv ? t(lang, 'search.resumeSaved') : t(lang, 'search.resumeNone'))}
        </Text>

        {/* Tune the search scope — selectable regions + level; the list filters live, Find re-scans. */}
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
        </View>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{t(lang, 'common.salary')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
          {SALARY_OPTS.map((n) => (
            <Chip key={n} label={n === 0 ? t(lang, 'salary.any') : `$${Math.round(n / 1000)}k`} active={(profile.salary || 0) === n} on={() => setSalary(n)} color={C.tint} />
          ))}
        </View>
        {profile.name ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}><Pill label={`👤 ${profile.name}`} color={C.tint} text={C.tint} /></View> : null}
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

      {visible.map((j) => (
        <Card key={j.url}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
          <Text style={{ color: C.dim, marginBottom: 2 }}>{j.company} · {j.location}{j.postedOn ? ` · ${j.postedOn}` : ''}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {/* Score is reserved for the evaluation (Apply) stage — Search shows only the fit indicator. */}
            <Pill label={t(lang, `search.confirm.${j.confirm}`)} color={confirmColor(j.confirm)} text={confirmColor(j.confirm)} />
            {j.gate ? <Pill label={`⛔ ${j.gate}`} color={C.bad} text={C.bad} /> : null}
          </View>
          <Text style={{ color: C.dim, marginTop: 6, fontSize: 12 }}>{j.screenReason}</Text>
        </Card>
      ))}
      {visible.length === 0 ? <Sub>{t(lang, 'search.emptyPrompt')}</Sub> : null}
    </ScrollView>
  );
}
