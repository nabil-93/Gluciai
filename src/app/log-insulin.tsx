import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, InputField, ScreenContainer, SelectCard } from '@/components/ui';
import { saveInsulin } from '@/services/data';
import { spacing, typography } from '@/theme';
import type { InsulinType } from '@/types';

export default function LogInsulinScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dose, setDose] = useState('');
  const [type, setType] = useState<InsulinType>('rapid');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    const num = Number(dose);
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
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>{t('log.insulinTitle')}</Text>
      <InputField
        label={t('log.insulinDose')}
        value={dose}
        onChangeText={setDose}
        keyboardType="numeric"
      />
      <View style={styles.types}>
        {(['rapid', 'long', 'mixed'] as InsulinType[]).map((it) => (
          <SelectCard
            key={it}
            label={t(`wizard.${it}`)}
            selected={type === it}
            onPress={() => setType(it)}
          />
        ))}
      </View>
      <InputField label={t('log.notes')} value={notes} onChangeText={setNotes} />
      <AppButton
        label={t('common.save')}
        onPress={save}
        loading={saving}
        disabled={!Number(dose)}
      />
      <AppButton label={t('common.cancel')} onPress={close} variant="ghost" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingHorizontal: spacing.xl },
  title: { ...typography.heading },
  types: { gap: spacing.sm },
});
