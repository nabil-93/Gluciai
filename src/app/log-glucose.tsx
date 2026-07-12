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

import { saveGlucose } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

/** Colour + label for the entered value against the patient's target range. */
function zone(v: number, low: number, high: number) {
  if (!v) return { color: '#9CA3AF', bg: '#F3F4F6' };
  if (v < low) return { color: '#FF7A1A', bg: '#FFF1E6' };
  if (v <= high) return { color: '#19C37D', bg: '#E9FBF2' };
  if (v <= high * 1.4) return { color: '#F2B84B', bg: '#FEF6E7' };
  return { color: '#FF3B30', bg: '#FEECEC' };
}

function DropIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"
        fill={color}
        opacity={0.16}
      />
      <Path
        d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function LogGlucoseScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const num = Number(value);
  const z = zone(num, low, high);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await saveGlucose(num, notes || undefined);
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
        <View style={[styles.iconBadge, { backgroundColor: z.bg }]}>
          <DropIcon color={z.color} />
        </View>
        <Text style={styles.title}>{t('log.glucoseTitle')}</Text>

        {/* Big value card */}
        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>{t('log.glucoseValue')}</Text>
          <View style={styles.valueRow}>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor="#D1D5DB"
              autoFocus
              style={[styles.valueInput, { color: num ? z.color : colors.text }]}
            />
            <Text style={styles.unit}>mg/dL</Text>
          </View>
          {num > 0 ? (
            <View style={[styles.zonePill, { backgroundColor: z.bg }]}>
              <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
              <Text style={[styles.zoneText, { color: z.color }]}>
                {num < low
                  ? t('glucosePage.low', 'Bas')
                  : num <= high
                    ? t('glucosePage.inRange', 'Dans la cible')
                    : t('glucosePage.high', 'Élevé')}
                {'  ·  '}
                {low}–{high}
              </Text>
            </View>
          ) : null}
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
        <Pressable onPress={save} disabled={!num || saving} style={{ marginTop: 26 }}>
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
  valueLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
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
    minWidth: 90,
  },
  unit: { fontSize: 18, fontWeight: '700', color: colors.textTertiary, marginBottom: 12 },
  zonePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    marginTop: 14,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneText: { fontSize: 12.5, fontWeight: '750' as any },

  notesLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 2,
  },
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
