import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, InputField, ScreenContainer } from '@/components/ui';
import { saveGlucose } from '@/services/data';
import { spacing, typography } from '@/theme';

export default function LogGlucoseScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    const num = Number(value);
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
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>{t('log.glucoseTitle')}</Text>
      <InputField
        label={t('log.glucoseValue')}
        value={value}
        onChangeText={setValue}
        keyboardType="numeric"
      />
      <InputField label={t('log.notes')} value={notes} onChangeText={setNotes} />
      <AppButton
        label={t('common.save')}
        onPress={save}
        loading={saving}
        disabled={!Number(value)}
      />
      <AppButton label={t('common.cancel')} onPress={close} variant="ghost" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingHorizontal: spacing.xl },
  title: { ...typography.heading },
});
