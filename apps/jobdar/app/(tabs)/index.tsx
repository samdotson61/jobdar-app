import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub, confirmColor } from '@/src/ui';

export default function Search() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const { setCv, loadSampleCv, runScan, toggleTransferable } = useStore.getState();
  const lang = profile.language;
  const [draft, setDraft] = useState(useStore.getState().cv);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'search.title')}</H>
      <Sub>{t(lang, 'search.intro')}  ·  {t(lang, 'common.demo')}</Sub>

      <Card>
        <Field
          multiline
          placeholder="résumé…"
          value={draft}
          onChangeText={(v) => { setDraft(v); setCv(v); }}
          style={{ minHeight: 84 }}
        />
        <Btn kind="ghost" label={t(lang, 'common.loadSample')} onPress={() => { loadSampleCv(); setDraft(useStore.getState().cv); }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
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
        <Btn label={t(lang, 'search.scan')} onPress={runScan} />
      </Card>

      {scored.map((j) => (
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
    </ScrollView>
  );
}
