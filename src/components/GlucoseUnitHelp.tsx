import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { unitCandidates } from '@/services/bolusEngine';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';

/**
 * A typed glucose value that cannot be mg/dL — and the two things it could be.
 *
 * Shown under every mg/dL glucose field (store audit C-04). A small number is
 * either g/L (Morocco, France: "1,20" = 120 mg/dL) or mmol/L ("6,7" = 121
 * mg/dL); the screen does not guess which. It names both readings in mg/dL and
 * lets the patient tap the one their meter shows, which fills the field with
 * that mg/dL value. Above the plausible g/L range only the mmol/L reading is
 * offered.
 *
 * Renders nothing for a value that is not an under-range reading.
 */
export function GlucoseUnitHelp({
  value,
  onPick,
}: {
  value: number | null | undefined;
  /** Called with the chosen reading, in mg/dL. */
  onPick: (mgdl: number) => void;
}) {
  const { t } = useTranslation();
  const { gl, mmol } = unitCandidates(value);
  if (gl === null && mmol === null) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.text}>{t('log.unitAmbiguous')}</Text>
      <View style={styles.row}>
        {gl !== null ? (
          <Pressable
            style={styles.chip}
            onPress={() => onPick(gl)}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{t('log.unitPickGl', { mgdl: gl })}</Text>
          </Pressable>
        ) : null}
        {mmol !== null ? (
          <Pressable
            style={styles.chip}
            onPress={() => onPick(mmol)}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{t('log.unitPickMmol', { mgdl: mmol })}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 10,
    backgroundColor: '#FFF4E5',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  text: { fontFamily: F600, fontSize: 13, lineHeight: 18, color: '#7C2D12' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipText: { fontFamily: F700, fontSize: 13, color: '#9A3412' },
});
