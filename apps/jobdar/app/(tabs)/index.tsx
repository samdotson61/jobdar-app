import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub, confirmColor } from '@/src/ui';

const looksBinary = (s: string) => {
  if (s.startsWith('%PDF') || s.startsWith('PK')) return true; // PDF / DOCX(zip)
  const head = s.slice(0, 1200);
  let bad = 0;
  for (let i = 0; i < head.length; i++) { const c = head.charCodeAt(i); if (c === 0 || (c < 9 && c !== 0)) bad++; }
  return head.length > 0 && bad > head.length * 0.04;
};

export default function Search() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const { setCv, loadSampleCv, loadResume, runScan, toggleTransferable } = useStore.getState();
  const lang = profile.language;
  const [draft, setDraft] = useState(useStore.getState().cv);
  const [msg, setMsg] = useState('');

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
      loadResume(text);
      setDraft(text);
      setMsg(`${t(lang, 'common.loaded')}: ${asset.name}`);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };

  const onSample = () => {
    loadSampleCv();
    setDraft(useStore.getState().cv);
    setMsg(`${t(lang, 'common.loaded')}: ${useStore.getState().profile.name}`);
  };

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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1, flexBasis: 130 }}><Btn label={`📄 ${t(lang, 'common.upload')}`} onPress={onUpload} /></View>
          <View style={{ flexGrow: 1, flexBasis: 130 }}><Btn kind="ghost" label={`🔁 ${t(lang, 'common.loadSample')}`} onPress={onSample} /></View>
        </View>
        {msg ? <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{msg}</Text> : null}

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
