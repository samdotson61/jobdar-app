import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub, bandColor } from '@/src/ui';

export default function Apply() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const verdicts = useStore((s) => s.verdicts);
  const tailored = useStore((s) => s.tailored);
  const { scoreOne, tailorOne } = useStore.getState();
  const lang = profile.language;
  const [dir, setDir] = useState<Record<string, string>>({});
  const queue = scored.filter((j) => j.confirm !== 'skip');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'apply.title')}</H>
      <Sub>{queue.length ? `${queue.length} roles past pre-confirm.` : 'Run Search first to build the queue.'}  ·  {t(lang, 'common.demo')}</Sub>

      {queue.map((j) => {
        const v = verdicts[j.url];
        const tl = tailored[j.url];
        return (
          <Card key={j.url}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
            <Text style={{ color: C.dim, marginBottom: 4 }}>{j.company} · {j.location}</Text>

            {!v ? (
              <Btn label={t(lang, 'apply.score')} onPress={() => scoreOne(j.url)} />
            ) : (
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill label={`${t(lang, `apply.band.${v.band}`)} · ${v.score.toFixed(1)}/5`} color={bandColor(v.band)} text={bandColor(v.band)} />
                  <Pill label={`${t(lang, 'common.pay')}: ${v.pay}`} />
                  {v.clamped ? <Pill label={`clamp: ${v.clamped}`} color={C.bad} text={C.bad} /> : null}
                </View>
                {v.criteria.map((c) => (
                  <Text key={c.key} style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                    <Text style={{ color: c.judgment === 'strong' ? C.good : c.judgment === 'partial' ? C.warn : C.bad }}>
                      {c.judgment === 'strong' ? '●' : c.judgment === 'partial' ? '◐' : '○'} {c.key} ({Math.round(c.weight * 100)}%)
                    </Text>{'  '}{c.evidence}
                  </Text>
                ))}

                <Field
                  placeholder={t(lang, 'apply.directive')}
                  value={dir[j.url] ?? ''}
                  onChangeText={(x) => setDir((d) => ({ ...d, [j.url]: x }))}
                />
                <Btn kind="ghost" label={t(lang, 'apply.tailor')} onPress={() => tailorOne(j.url, (dir[j.url] ?? '').split(',').map((s) => s.trim()).filter(Boolean))} />

                {tl ? (
                  <View style={{ marginTop: 8, borderTopColor: C.cardEdge, borderTopWidth: 1, paddingTop: 8 }}>
                    <Text style={{ color: C.tint, fontWeight: '700', fontSize: 12, marginBottom: 4 }}>{t(lang, 'apply.summary')}</Text>
                    <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>{tl.summary}</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 8, lineHeight: 17 }}>{tl.coverLetter}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                      {tl.keywords.map((k) => <Pill key={k} label={k} />)}
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
