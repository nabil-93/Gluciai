import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveInsulin } from '@/services/data';
import { colors, shadows } from '@/theme';
import type { InsulinType } from '@/types';

const TYPES: { key: InsulinType; color: string }[] = [
  { key: 'rapid', color: '#3B82F6' },
  { key: 'long', color: '#6D5EF9' },
  { key: 'mixed', color: '#FF7A1A' },
];

function SyringeIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="m14 6 4 4M18 4l2 2M13 7 6.5 13.5 4 20l-1 1M8.5 11.5l2 2M11 9l2 2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function LogInsulinScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [dose, setDose] = useState('');
  const [type, setType] = useState<InsulinType>('rapid');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const num = Number(dose);
  const active = TYPES.find((x) => x.key === type)!;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await saveInsulin(num, type, notes || undefined);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 22 }}>
        <View style={[styles.iconBadge, { backgroundColor: `${active.color}18` }]}>
          <SyringeIcon color={active.color} />
        </View>
        <Text style={styles.title}>{t('log.insulinTitle')}</Text>

        {/* Big dose card */}
        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>{t('log.insulinDose')}</Text>
          <View style={styles.valueRow}>
            <TextInput
              value={dose}
              onChangeText={setDose}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor="#D1D5DB"
              autoFocus
              style={[styles.valueInput, { color: num ? active.color : colors.text }]}
            />
            <Text style={styles.unit}>U</Text>
          </View>
        </View>

        {/* Type selector */}
        <Text style={styles.notesLabel}>{t('profile.insulinTypes')}</Text>
        <View style={styles.typeRow}>
          {TYPES.map((it) => {
            const on = type === it.key;
            return (
              <Pressable
                key={it.key}
                onPress={() => setType(it.key)}
                style={[
                  styles.typeChip,
                  on && { backgroundColor: `${it.color}14`, borderColor: it.color },
                ]}
              >
                <View
                  style={[
                    styles.typeDot,
                    { backgroundColor: on ? it.color : '#D1D5DB' },
                  ]}
                />
                <Text
                  style={[styles.typeText, on && { color: it.color }]}
                  numberOfLines={1}
                >
                  {t(`wizard.${it.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.notesLabel}>{t('log.notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="…"
          placeholderTextColor={colors.textPlaceholder}
          style={styles.notesInput}
        />

        {/* Actions */}
        <Pressable onPress={save} disabled={!num || saving} style={{ marginTop: 24 }}>
          <LinearGradient
            colors={!num ? ['#B9E9D3', '#B9E9D3'] : ['#2ee59d', '#19C37D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>
              {saving ? '…' : t('common.save')}
            </Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={close} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  iconBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
    marginBottom: 22,
  },
  valueCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 22,
    ...shadows.soft,
  },
  valueLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  valueInput: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1.5,
    padding: 0,
    minWidth: 80,
  },
  unit: { fontSize: 20, fontWeight: '700', color: colors.textTertiary, marginBottom: 12 },

  notesLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 2,
  },
  typeRow: { flexDirection: 'row', gap: 9 },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.soft,
  },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeText: { fontSize: 13.5, fontWeight: '750' as any, color: colors.textSecondary },

  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15.5,
    fontWeight: '600',
    color: colors.text,
    ...shadows.soft,
  },

  saveBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#19C37D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveBtnText: { fontSize: 16.5, fontWeight: '800', color: '#ffffff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 15, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
});
