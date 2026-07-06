import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BevelCard, ChevronLeft } from '@/components/ui';
import {
  availableForThisDevice,
  type HealthProvider,
} from '@/services/health';
import { colors, shadows } from '@/theme';

export default function IntegrationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  const providers = availableForThisDevice();

  useEffect(() => {
    (async () => {
      const map: Record<string, boolean> = {};
      for (const p of providers) {
        map[p.id] = await p.isAvailable();
      }
      setAvailability(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const connect = async (p: HealthProvider) => {
    await p.connect();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>Capteurs & santé</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.subtitle}>
          Connectez vos capteurs et plateformes santé — vos mesures arrivent
          automatiquement dans GlucoAI.
        </Text>

        <View style={{ gap: 12 }}>
          {providers.map((p) => {
            const available = availability[p.id] ?? false;
            return (
              <BevelCard key={p.id} style={styles.card}>
                <Text style={{ fontSize: 30 }}>{p.icon}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.desc}>{p.description}</Text>
                </View>
                {available ? (
                  <Pressable
                    onPress={() => connect(p)}
                    style={styles.connectBtn}
                  >
                    <Text style={styles.connectText}>Connecter</Text>
                  </Pressable>
                ) : (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>Bientôt</Text>
                  </View>
                )}
              </BevelCard>
            );
          })}
        </View>

        <Text style={styles.note}>
          Les connexions natives (HealthKit, Health Connect, LibreLinkUp,
          Dexcom Share) s'activent dans l'application publiée sur l'App Store
          et Google Play — l'architecture est déjà prête.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontSize: 19, fontWeight: '750' as any, color: colors.text },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 16,
    marginHorizontal: 2,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 16, fontWeight: '750' as any, color: colors.text },
  desc: { marginTop: 3, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  connectBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  connectText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  soonBadge: {
    backgroundColor: colors.surface2,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  soonText: { fontSize: 13, fontWeight: '650' as any, color: colors.textSecondary },
  note: {
    marginTop: 18,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
