// Settings (Phase 10) — the model manager + backend chooser. Native default is the ON-DEVICE backend:
// download the model once (confirm-gated, ~1-3GB, resumable) and everything runs locally. The serve
// mode is the Mac-companion path (jobdar serve --host 0.0.0.0 + bearer token) — also how TestFlight
// testers without an 8GB phone can ride a Mac. Honest throughout: sizes, tiers, and state are real.
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { backendMode, configureServe, serveBase, type BackendMode } from '@/src/serve';
import { MODEL_TIERS, installedTier, recommendedTier, downloadModel, deleteModels, llmAvailable, type ModelTier } from '@/src/local/llm';
import { Btn, C, Card, Field, H, Pill, Sub } from '@/src/ui';

export default function Settings() {
  const profile = useStore((s) => s.profile);
  const { hydrate } = useStore.getState();
  const lang = profile.language;
  const [mode, setMode] = useState<BackendMode>(backendMode());
  const [base, setBase] = useState(serveBase());
  const [token, setToken] = useState('');
  const [installed, setInstalled] = useState<ModelTier | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const rec = llmAvailable() ? recommendedTier() : null;

  const refresh = () => { if (llmAvailable()) installedTier().then(setInstalled); };
  useEffect(refresh, []);

  const applyMode = (m: BackendMode) => {
    setMode(m);
    configureServe({ mode: m, persist: true });
    hydrate(); // re-check health against the newly chosen backend
  };

  const onDownload = async (m: ModelTier) => {
    setMsg('');
    setProgress(0);
    try {
      await downloadModel(m, (frac: number) => setProgress(frac));
      setMsg(t(lang, 'settings.downloaded'));
      refresh();
      hydrate();
    } catch (e: any) {
      setMsg(String(e?.message ?? e)); // honest failure (network, disk) — never a fake success
    }
    setProgress(null);
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'settings.title')}</H>
      <Sub>{t(lang, 'settings.intro')}</Sub>

      <Card>
        <Text style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>{t(lang, 'settings.backend')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {llmAvailable() ? (
            <Btn kind={mode === 'local' ? 'primary' : 'ghost'} label={t(lang, 'settings.local')} onPress={() => applyMode('local')} />
          ) : null}
          <Btn kind={mode === 'serve' ? 'primary' : 'ghost'} label={t(lang, 'settings.serve')} onPress={() => applyMode('serve')} />
        </View>
      </Card>

      {mode === 'local' && llmAvailable() ? (
        <Card>
          <Text style={{ color: C.dim, fontSize: 12, marginBottom: 6 }}>{t(lang, 'settings.model')}</Text>
          {installed ? (
            <View>
              <Pill label={t(lang, 'settings.modelReady', { file: installed.file })} color={C.good} text={C.good} />
              <Btn kind="ghost" label={t(lang, 'settings.delete')} onPress={() => deleteModels().then(() => { refresh(); hydrate(); })} />
            </View>
          ) : (
            <View>
              <Text style={{ color: C.text, fontSize: 13, lineHeight: 18, marginBottom: 6 }}>{t(lang, 'settings.noModel')}</Text>
              {MODEL_TIERS.map((m: ModelTier) => (
                <Btn
                  key={m.tier}
                  kind={rec && rec.tier === m.tier ? 'primary' : 'ghost'}
                  label={`${t(lang, 'settings.download', { size: String(m.sizeGb) })} — ${m.file}${rec && rec.tier === m.tier ? ` (${t(lang, 'settings.recommended')})` : ''}`}
                  disabled={progress != null}
                  progress={progress ?? undefined}
                  onPress={() => onDownload(m)}
                />
              ))}
            </View>
          )}
          {msg ? <Text style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{msg}</Text> : null}
        </Card>
      ) : null}

      {mode === 'serve' ? (
        <Card>
          <Text style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>{t(lang, 'settings.serveHelp')}</Text>
          <Field placeholder="http://192.168.1.20:4320" value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} />
          <Field placeholder={t(lang, 'settings.token')} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />
          <Btn label={t(lang, 'settings.save')} onPress={() => { configureServe({ base, token, mode: 'serve', persist: true }); hydrate(); }} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
