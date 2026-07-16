import { Tabs } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { C } from '@/src/ui';

export default function TabLayout() {
  const lang = useStore((s) => s.profile.language);
  const setLang = useStore((s) => s.setLang);
  const icon = (emoji: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{emoji}</Text>;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.tint,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.cardEdge },
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerRight: () => (
          <Pressable onPress={() => setLang(lang === 'en' ? 'es' : 'en')} hitSlop={12} style={{ marginRight: 16 }}>
            <Text style={{ color: C.tint, fontWeight: '700' }}>{lang === 'en' ? 'ES' : 'EN'}</Text>
          </Pressable>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: t(lang, 'tab.search'), tabBarIcon: icon('🔎') }} />
      <Tabs.Screen name="apply" options={{ title: t(lang, 'tab.apply'), tabBarIcon: icon('📝') }} />
      <Tabs.Screen name="followup" options={{ title: t(lang, 'tab.followup'), tabBarIcon: icon('✉️') }} />
    </Tabs>
  );
}
