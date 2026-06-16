import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { relevanceScore } from '@jobdar/engine';
import { Btn, C, Card, Field, H, Pill, Sub, confirmColor } from '@/src/ui';

const looksBinary = (s: string) => {
  if (s.startsWith('%PDF') || s.startsWith('PK')) return true; // PDF / DOCX(zip)
  const head = s.slice(0, 1200);
  let bad = 0;
  for (let i = 0; i < head.length; i++) { const c = head.charCodeAt(i); if (c === 0 || (c < 9 && c !== 0)) bad++; }
  return head.length > 0 && bad > head.length * 0.04;
};

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
  const { loadResume, runSearch, toggleTransferable, setIntent } = useStore.getState();
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
    if (active) rows = rows.filter((j) => rel(j) > 0 || j.confirm === 'fit'); // cut roles irrelevant to the intent
    if (filter !== 'all') rows = rows.filter((j) => (j.confirm ?? 'skip') === filter);
    const out = [...rows];
    if (sortBy === 'fresh') out.sort((a, b) => String(b.postedOn || '').localeCompare(String(a.postedOn || '')));
    else if (sortBy === 'company') out.sort((a, b) => a.company.localeCompare(b.company));
    else out.sort((a, b) => (active ? rel(b) - rel(a) : 0) || Number(Boolean(a.gate)) - Number(Boolean(b.gate)) || b.prescreen - a.prescreen);
    return out;
  }, [scored, query, sortBy, filter, terms]);

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const text = await (await fetch(asset.uri)).text();
      if (looksBinary(text)) { setMsg(t(lang, 'common.binary')); return; }
      loadResume(text); // persists to serve (data/cv.md) so scan/prescreen/eval use it
      setMsg(`${t(lang, 'common.loaded')}: ${asset.name}`);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };

  const Chip = ({ label, active, on, color }: { label: string; active: boolean; on: () => void; color: string }) => (
    <Pressable onPress={on}>
      <Pill label={label} color={active ? color : C.chip} text={active ? color : C.dim} />
    </Pressable>
  );

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
        <Text style={{ color: msg ? C.dim : cv ? C.good : C.dim, fontSize: 12, marginTop: 6 }}>
          {msg || (cv ? t(lang, 'search.resumeLoaded') : t(lang, 'search.resumeNone'))}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          {profile.name ? <Pill label={`👤 ${profile.name}`} color={C.tint} text={C.tint} /> : null}
          <Pill label={`${t(lang, 'common.region')}: ${profile.regions.join(', ')}`} />
          <Pill label={`${t(lang, 'common.level')}: ${profile.levels.join(', ')}`} />
          <Pressable onPress={toggleTransferable}>
            <Pill
              label={`${t(lang, 'search.transferable')} ${profile.transferable ? '✓' : '○'}`}
              color={profile.transferable ? C.good : C.chip}
              text={profile.transferable ? C.good : C.dim}
            />
          </Pressable>
        </View>
        <Btn
          label={t(lang, 'search.scan')}
          onPress={runSearch}
          disabled={busy === 'scan'}
          progress={busy === 'scan' ? Math.max(0.04, progress) : undefined}
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
            <Pill label={`${j.prescreen}/100`} color={C.tint} text={C.tint} />
            <Pill label={t(lang, `search.confirm.${j.confirm}`)} color={confirmColor(j.confirm)} text={confirmColor(j.confirm)} />
            {j.gate ? <Pill label={`⛔ ${j.gate}`} color={C.bad} text={C.bad} /> : null}
          </View>
          <Text style={{ color: C.dim, marginTop: 6, fontSize: 12 }}>{j.screenReason}</Text>
        </Card>
      ))}
      {visible.length === 0 ? <Sub>—</Sub> : null}
    </ScrollView>
  );
}
