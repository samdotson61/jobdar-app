// The honest backend/AI status card (1.64.0), shared by Search and Apply. One place answers "can Jobdar
// score right now, and if not, what do I do?":
//   • serve unreachable            → say so + Retry (unchanged)
//   • on-device (phone) mode        → the model isn't downloaded → Settings (unchanged)
//   • serve up, AI down, MANAGED    → the desktop's one-click setup: an explicit button (it's a multi-GB
//                                     download — the tap is the consent), then real progress from winc
//   • serve up, AI down, unmanaged  → a plain `jobdar serve` user: the terminal command
// Renders nothing when the AI is up — no reassuring "all good" chrome.
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '@/src/store';
import { backendMode } from '@/src/serve';
import { t } from '@/src/engine';
import { Btn, C, Card } from '@/src/ui';

const gb = (x: number | null | undefined) => (x == null ? '?' : x.toFixed(x >= 10 ? 0 : 1));

export function AiBanner() {
  const lang = useStore((s) => s.profile.language);
  const serveUp = useStore((s) => s.serveUp);
  const modelUp = useStore((s) => s.modelUp);
  const ai = useStore((s) => s.aiSetup);
  const { hydrate, startAi } = useStore.getState();

  if (!serveUp) {
    return (
      <Card style={{ borderColor: C.warn }}>
        <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t(lang, 'search.backendDown')}</Text>
        <Btn kind="ghost" label={t(lang, 'common.retry')} onPress={hydrate} />
      </Card>
    );
  }
  if (backendMode() === 'local') {
    return modelUp ? null : (
      <Card style={{ borderColor: C.warn }}>
        <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t(lang, 'search.modelMissing')}</Text>
        <Btn kind="ghost" label={t(lang, 'common.settings')} onPress={() => router.push('/settings' as any)} />
      </Card>
    );
  }
  if (modelUp) return null;

  const line = (txt: string, color = C.text) => <Text style={{ color, fontSize: 13, lineHeight: 19, marginBottom: 6 }}>{txt}</Text>;

  if (!ai) {
    return (
      <Card style={{ borderColor: C.warn }}>
        {line(t(lang, 'ai.cli'), C.warn)}
        <Btn kind="ghost" label={t(lang, 'common.retry')} onPress={hydrate} />
      </Card>
    );
  }

  const size = gb(ai.sizeGB);
  if (ai.phase === 'downloading' || ai.phase === 'engine' || ai.phase === 'starting') {
    let msg: string;
    if (ai.phase === 'downloading') {
      const eta = ai.etaSec == null ? '' : ai.etaSec < 60 ? t(lang, 'ai.etaSoon') : t(lang, 'ai.etaMin', { min: Math.ceil(ai.etaSec / 60) });
      msg = t(lang, 'ai.downloading', { pct: ai.pct ?? 0, done: gb(ai.doneGB ?? 0), total: gb(ai.totalGB ?? ai.sizeGB) }) + eta;
    } else if (ai.phase === 'engine') {
      msg = ai.pct == null ? t(lang, 'ai.engineNoPct') : t(lang, 'ai.engine', { pct: ai.pct });
    } else msg = t(lang, 'ai.starting');
    const frac = ai.phase === 'starting' ? undefined : Math.max(0.02, (ai.pct ?? 0) / 100);
    return (
      <Card style={{ borderColor: C.tint }}>
        {line(msg)}
        {frac != null ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.chip, overflow: 'hidden', marginBottom: 6 }}>
            <View style={{ width: `${Math.round(frac * 100)}%`, height: 6, backgroundColor: C.tint }} />
          </View>
        ) : null}
        <Text style={{ color: C.dim, fontSize: 12 }}>{t(lang, 'ai.keepOpen')}</Text>
      </Card>
    );
  }

  if (ai.phase === 'error') {
    const msg = ai.code === 'disk'
      ? t(lang, 'ai.errorDisk', { free: gb(ai.freeGB), need: ai.needGB })
      : t(lang, 'ai.error', { error: ai.error || '?' });
    return (
      <Card style={{ borderColor: C.bad }}>
        {line(msg, C.bad)}
        <Btn label={t(lang, 'ai.retryBtn')} onPress={startAi} />
      </Card>
    );
  }

  // idle (or stopping): not set up yet → the one-time offer; already downloaded → just start it.
  if (ai.modelPresent) {
    return (
      <Card style={{ borderColor: C.warn }}>
        {line(t(lang, 'ai.stopped'), C.warn)}
        <Btn label={t(lang, 'ai.startBtn')} onPress={startAi} />
      </Card>
    );
  }
  return (
    <Card style={{ borderColor: C.tint }}>
      <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>{t(lang, 'ai.needTitle')}</Text>
      {line(t(lang, 'ai.needBody', { gb: size }), C.dim)}
      <Btn label={t(lang, 'ai.setupBtn', { gb: size })} onPress={startAi} />
    </Card>
  );
}
