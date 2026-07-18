import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ActivityGlyph, ChevronLeft } from '@/components/ui';
import { changeActivityStatus } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';
import type { ActivityStatus } from '@/types';

const OPTIONS = [
  { key: 'active', labelKey: 'activeLabel', descKey: 'activeDesc', color: colors.primary },
  { key: 'sick', labelKey: 'sickLabel', descKey: 'sickDesc', color: colors.warning },
  { key: 'injured', labelKey: 'injuredLabel', descKey: 'injuredDesc', color: colors.protein },
  { key: 'paused', labelKey: 'pausedLabel', descKey: 'pausedDesc', color: colors.textSecondary },
] as const;

export default function ActivityStatusScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const activityStatus = useAppStore((s) => s.activityStatus);
  const [step, setStep] = useState<'intro' | 'choice'>('choice');
  const [selected, setSelected] = useState<ActivityStatus>(activityStatus);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const update = () => {
    // Recorded as an account event → history, day report, AI context.
    void changeActivityStatus(selected);
    close();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <View style={styles.sheet}>
        {step === 'intro' ? (
          <>
            <View style={styles.head}>
              <Pressable style={styles.backBtn} onPress={close}>
                <ChevronLeft size={16} />
              </Pressable>
              <Text style={styles.headTitle}>{t('activityStatus.title')}</Text>
            </View>

            <View style={styles.iconsGrid}>
              {[colors.primary, colors.warning, colors.protein, colors.textSecondary].map(
                (c, i) => (
                  <View key={i} style={[styles.iconTile, { backgroundColor: c }]}>
                    <ActivityGlyph size={26} color="#fff" />
                  </View>
                )
              )}
            </View>

            <Text style={styles.centerTitle}>{t('activityStatus.title')}</Text>
            <Text style={styles.centerBody}>{t('activityStatus.intro')}</Text>
            <Pressable style={styles.cta} onPress={() => setStep('choice')}>
              <Text style={styles.ctaText}>{t('activityStatus.continue')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.head}>
              <Pressable style={styles.backBtn} onPress={() => setStep('intro')}>
                <ChevronLeft size={16} />
              </Pressable>
              <Text style={styles.headTitle}>{t('activityStatus.title')}</Text>
            </View>

            <View style={{ gap: 10 }}>
              {OPTIONS.map((o) => {
                const on = selected === o.key;
                return (
                  <Pressable
                    key={o.key}
                    style={styles.optionRow}
                    onPress={() => setSelected(o.key as ActivityStatus)}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: o.color }]}>
                      <ActivityGlyph size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionLabel}>{t(`activityStatus.${o.labelKey}`)}</Text>
                      <Text style={styles.optionDesc}>{t(`activityStatus.${o.descKey}`)}</Text>
                    </View>
                    <View style={[styles.radio, on && styles.radioOn]}>
                      {on ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.cta} onPress={update}>
              <Text style={styles.ctaText}>{t('activityStatus.update')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,20,30,0.32)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 32,
    padding: 22,
    paddingBottom: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontSize: 19, fontWeight: '750' as any, color: colors.text },
  iconsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 6,
    marginBottom: 20,
  },
  iconTile: {
    width: '47%',
    flexGrow: 1,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: { textAlign: 'center', fontSize: 19, fontWeight: '750' as any, color: colors.text },
  centerBody: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    paddingHorizontal: 6,
  },
  cta: {
    marginTop: 20,
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.backgroundElevated,
    borderRadius: 20,
    padding: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontSize: 16, fontWeight: '650' as any, color: colors.text },
  optionDesc: { marginTop: 2, fontSize: 13.5, color: colors.textSecondary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D6D6DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.ink },
});
