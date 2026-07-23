import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui';
import { signOut, uploadAvatar } from '@/services/account';
import { saveProfile } from '@/services/data';
import { confirmAsync } from '@/lib/confirm';
import { planStatus } from '@/services/features';
import { useAppStore } from '@/store/useAppStore';
import type { Profile } from '@/types';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* ── Design palette (Mint Hub reference) ── */
const INK = '#0C1D16';
const MUTED = '#8CA097';
const GREEN = '#21C57E';
const GREEN_DEEP = '#0FA968';
const CARD_BORDER = '#E7EDE9';

/* ─────────────────────────── Icons ─────────────────────────── */

type IconProps = { size?: number; color?: string; sw?: number };

const Chevron = ({ size = 17, color = '#B8C4BE', sw = 2.5 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m9 18 6-6-6-6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const BackIcon = () => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <Path d="m15 18-6-6 6-6" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SlidersIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Line x1={21} y1={5} x2={14} y2={5} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Line x1={10} y1={5} x2={3} y2={5} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Line x1={21} y1={12} x2={12} y2={12} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Line x1={8} y1={12} x2={3} y2={12} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Line x1={21} y1={19} x2={16} y2={19} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Line x1={12} y1={19} x2={3} y2={19} stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={5} r={2} stroke={INK} strokeWidth={2} />
    <Circle cx={10} cy={12} r={2} stroke={INK} strokeWidth={2} />
    <Circle cx={14} cy={19} r={2} stroke={INK} strokeWidth={2} />
  </Svg>
);

const CameraIcon = () => (
  <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
      stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
    />
    <Circle cx={12} cy={13} r={3} stroke="#FFFFFF" strokeWidth={2.4} />
  </Svg>
);

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z';

const StarIcon = ({ size = 10, color = '#C08A2D' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d={STAR_PATH} stroke={color} strokeWidth={1} strokeLinejoin="round" />
  </Svg>
);

const RulerIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={8} width={18} height={8} rx={1} stroke={GREEN_DEEP} strokeWidth={2} />
    <Path d="M7 8v3M12 8v3M17 8v3" stroke={GREEN_DEEP} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const GaugeIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={13} r={8} stroke="#3B82C4" strokeWidth={2} />
    <Path d="M12 13l3-4" stroke="#3B82C4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 3h6" stroke="#3B82C4" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const CalendarIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={18} rx={2} stroke="#7C6FDE" strokeWidth={2} />
    <Path d="M16 2v4M8 2v4M3 10h18" stroke="#7C6FDE" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const TargetIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke="#E8833A" strokeWidth={2} />
    <Circle cx={12} cy={12} r={4.5} stroke="#E8833A" strokeWidth={2} />
    <Circle cx={12} cy={12} r={1} fill="#E8833A" />
  </Svg>
);

const ChatIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

const LogoutIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#D64545" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="m16 17 5-5-5-5" stroke="#D64545" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 12H9" stroke="#D64545" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Stroke row icons — one path each, lucide-style. */
function RowIcon({ name, color }: { name: string; color: string }) {
  const paths: Record<string, React.ReactNode> = {
    user: (
      <>
        <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={2} />
      </>
    ),
    heart: (
      <Path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    ),
    pulse: (
      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    ),
    phone: (
      <Path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    ),
    star: <Path d={STAR_PATH} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />,
    shield: (
      <Path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    ),
    globe: (
      <>
        <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
        <Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    warn: (
      <>
        <Path
          d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        />
        <Path d="M12 9v4M12 17h.01" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </>
    ),
    gauge: (
      <>
        <Path d="M12 14l3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M3.5 18.5a10 10 0 1 1 17 0" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      {paths[name]}
    </Svg>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */

/** 58px conic-style completion ring (SVG arc + inner white disc). */
function CompletionRing({ pct }: { pct: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <View style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={58} height={58} viewBox="0 0 58 58" style={{ position: 'absolute' }}>
        <Circle cx={29} cy={29} r={R} stroke="#E7EFEA" strokeWidth={6} fill="none" />
        <Circle
          cx={29}
          cy={29}
          r={R}
          stroke={GREEN_DEEP}
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${(C * pct) / 100} ${C}`}
          strokeLinecap="round"
          transform="rotate(-90 29 29)"
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text style={styles.ringPct}>{pct}%</Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  tint,
  color,
  title,
  sub,
  onPress,
}: {
  icon: string;
  tint: string;
  color: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <RowIcon name={icon} color={color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

const Divider = () => <View style={styles.divider} />;

/* ─────────────────────────── Screen ─────────────────────────── */

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const lockedFeatures = useAppStore((s) => s.lockedFeatures);
  const wizardDone = useAppStore((s) => s.wizardDone);

  if (!profile) return <Redirect href={wizardDone ? '/(tabs)' : '/auth'} />;

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    const url = await uploadAvatar(asset.uri, asset.base64 ?? undefined);
    await saveProfile({ ...profile, avatar_url: url ?? asset.uri });
  };

  const onSignOut = async () => {
    const ok = await confirmAsync({
      title: t('profile.signOut'),
      message: t('profile.signOutConfirm'),
      confirmLabel: t('profile.signOut'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await signOut();
    // Profile is a modal: dismiss it (and anything stacked) first, otherwise
    // replace() swaps the modal's content and the app can fall back to the
    // tabs instead of the login screen. Then make /auth the fresh root, so
    // there's no back-history into the signed-out account.
    try {
      router.dismissAll();
    } catch {}
    router.replace('/auth');
  };

  const openEdit = (section: string) =>
    router.push(`/profile-edit?section=${section}` as any);

  /* Completion: share of the key profile fields already filled in. */
  const fields: (keyof Profile)[] = [
    'name',
    'birth_date',
    'gender',
    'height',
    'weight',
    'diabetes_type',
    'target_low',
    'target_high',
    'avatar_url',
    'doctor_name',
    'doctor_phone',
    'emergency_contact_name',
    'emergency_contact_phone',
    'home_address',
  ];
  const filled = fields.filter((k) => {
    const v = profile[k];
    return v !== undefined && v !== null && v !== '';
  }).length;
  const pct = Math.round(
    ((filled + ((profile.insulin_types?.length ?? 0) > 0 ? 1 : 0)) /
      (fields.length + 1)) *
      100
  );

  const age = (() => {
    if (!profile.birth_date) return null;
    const b = new Date(profile.birth_date);
    if (Number.isNaN(b.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a;
  })();

  const premium = planStatus(lockedFeatures) !== 'free';

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        <Pressable onPress={() => openEdit('personal')} hitSlop={8} style={styles.headerBtn}>
          <SlidersIcon />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 30,
          gap: 14,
        }}
      >
        {/* Identity card */}
        <View style={styles.idCard}>
          <Pressable onPress={pickAvatar} style={{ flexShrink: 0 }}>
            <View style={styles.avatarRing}>
              <Avatar name={profile.name} uri={profile.avatar_url} size={52} />
            </View>
            <View style={styles.avatarBadge}>
              <CameraIcon />
            </View>
          </Pressable>
          <View style={styles.idBody}>
            <Text style={styles.idName} numberOfLines={1}>
              {profile.name || '—'}
            </Text>
            <View style={styles.chipRow}>
              {profile.diabetes_type ? (
                <View style={styles.typeChip}>
                  <Text style={styles.typeChipText}>
                    {t(`profile.${profile.diabetes_type}`)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.planChip}>
                <StarIcon />
                <Text style={styles.planChipText}>
                  {premium ? t('profile.premium') : t('profile.freePlan')}
                </Text>
              </View>
            </View>
            <Text style={styles.idTagline} numberOfLines={2}>
              {t('profile.tagline')}
            </Text>
          </View>
          <View style={styles.ringCol}>
            <CompletionRing pct={pct} />
            <Text style={styles.ringLabel}>{t('profile.completion')}</Text>
          </View>
        </View>

        {/* Quick stats */}
        <View style={styles.statsCard}>
          <View style={styles.statCell}>
            <View style={[styles.statIcon, { backgroundColor: '#E8F5EE' }]}>
              <RulerIcon />
            </View>
            <Text style={styles.statLabel}>{t('profile.statHeight')}</Text>
            <Text style={styles.statValue}>
              {profile.height != null ? `${profile.height} cm` : '—'}
            </Text>
          </View>
          <View style={[styles.statCell, styles.statCellSep]}>
            <View style={[styles.statIcon, { backgroundColor: '#E8F1FA' }]}>
              <GaugeIcon />
            </View>
            <Text style={styles.statLabel}>{t('profile.statWeight')}</Text>
            <Text style={styles.statValue}>
              {profile.weight != null ? `${profile.weight} kg` : '—'}
            </Text>
          </View>
          <View style={[styles.statCell, styles.statCellSep]}>
            <View style={[styles.statIcon, { backgroundColor: '#EFEDFB' }]}>
              <CalendarIcon />
            </View>
            <Text style={styles.statLabel}>{t('profile.statAge')}</Text>
            <Text style={styles.statValue}>
              {age != null ? t('profile.ageYears', { age }) : '—'}
            </Text>
          </View>
          <View style={[styles.statCell, styles.statCellSep, { flex: 1.2 }]}>
            <View style={[styles.statIcon, { backgroundColor: '#FDF0E4' }]}>
              <TargetIcon />
            </View>
            <Text style={styles.statLabel}>{t('profile.statGoal')}</Text>
            <Text style={[styles.statValue, { fontSize: 11.5 }]}>
              {profile.target_low != null && profile.target_high != null
                ? `${profile.target_low}–${profile.target_high} mg/dL`
                : '—'}
            </Text>
          </View>
        </View>

        {/* AI helper banner */}
        <LinearGradient
          colors={['#E9F9F1', '#F1FBF4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={styles.aiCard}
        >
          <View style={styles.aiFace}>
            <View style={{ alignItems: 'center' }}>
              <View style={styles.aiAntennaDot} />
              <View style={styles.aiAntennaStem} />
              <View style={styles.aiHead}>
                <View style={styles.aiEye} />
                <View style={styles.aiEye} />
              </View>
            </View>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.aiTitle}>{t('profile.aiTitle')}</Text>
            <Text style={styles.aiSub}>{t('profile.aiSub')}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/ai-chat' as any)}
            style={({ pressed }) => [styles.aiCta, pressed && { opacity: 0.85 }]}
          >
            <ChatIcon />
            <Text style={styles.aiCtaText}>{t('profile.aiCta')}</Text>
          </Pressable>
        </LinearGradient>

        {/* Profile sections */}
        <View style={styles.group}>
          <Row
            icon="user"
            tint="#E8F5EE"
            color={GREEN_DEEP}
            title={t('profile.sectionPersonal')}
            sub={t('profile.subPersonal')}
            onPress={() => openEdit('personal')}
          />
          <Divider />
          <Row
            icon="heart"
            tint="#FDECEC"
            color="#E05252"
            title={t('profile.sectionMedical')}
            sub={t('profile.subMedical')}
            onPress={() => openEdit('medical')}
          />
          <Divider />
          <Row
            icon="pulse"
            tint="#EFEDFB"
            color="#7C6FDE"
            title={t('profile.sectionDoctor')}
            sub={t('profile.subDoctor')}
            onPress={() => openEdit('doctor')}
          />
          <Divider />
          <Row
            icon="phone"
            tint="#FDF0E4"
            color="#E8833A"
            title={t('profile.sectionEmergency')}
            sub={t('profile.subEmergency')}
            onPress={() => openEdit('emergency')}
          />
        </View>

        {/* App sections */}
        <View style={styles.group}>
          <Row
            icon="star"
            tint="#FBF1DC"
            color="#C08A2D"
            title={t('profile.planRowTitle')}
            sub={t('profile.subPlan')}
            onPress={() => router.push('/subscription' as any)}
          />
          <Divider />
          <Row
            icon="gauge"
            tint="#EAF2FC"
            color="#3B82C4"
            title={t('profile.sectionUsage')}
            sub={t('profile.subUsage')}
            onPress={() => router.push('/usage-limits' as any)}
          />
          <Divider />
          <Row
            icon="shield"
            tint="#E8F5EE"
            color={GREEN_DEEP}
            title={t('profile.sectionSecurity')}
            sub={t('profile.subSecurity')}
            onPress={() => openEdit('security')}
          />
          <Divider />
          <Row
            icon="globe"
            tint="#E8F1FA"
            color="#3B82C4"
            title={t('profile.sectionLanguages')}
            sub={t('profile.subLanguages')}
            onPress={() => openEdit('language')}
          />
          <Divider />
          <Row
            icon="phone"
            tint="#E6F6EC"
            color="#0F7A42"
            title={t('profile.sectionSupport')}
            sub={t('profile.subSupport')}
            onPress={() => router.push('/support' as never)}
          />
          <Divider />
          <Row
            icon="warn"
            tint="#FDF0E4"
            color="#E8833A"
            title={t('profile.disclaimerRowTitle')}
            sub={t('profile.disclaimerRowSub')}
            onPress={() => router.push('/consent-detail?id=limits' as any)}
          />
        </View>

        {/* Sign out */}
        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        >
          <LogoutIcon />
          <Text style={styles.logoutText}>{t('profile.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4EAE6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(12,29,22,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F800,
    fontSize: 17,
    color: INK,
  },

  /* Identity card */
  idCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: 'rgba(12,29,22,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: GREEN,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idBody: { flex: 1, gap: 6 },
  idName: { fontFamily: F800, fontSize: 19, color: INK, lineHeight: 21 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  typeChip: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#E8F5EE',
  },
  typeChipText: { fontFamily: F800, fontSize: 11, color: '#067647' },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#FBF1DC',
  },
  planChipText: { fontFamily: F800, fontSize: 11, color: '#9A6A16' },
  idTagline: { fontFamily: F600, fontSize: 12, color: '#7A8A82' },
  ringCol: { alignItems: 'center', gap: 5, flexShrink: 0 },
  ringInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: { fontFamily: F800, fontSize: 13, color: INK },
  ringLabel: {
    fontFamily: F800,
    fontSize: 9,
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
    maxWidth: 74,
    textAlign: 'center',
  },

  /* Stats card */
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    shadowColor: 'rgba(12,29,22,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 4 },
  statCellSep: { borderLeftWidth: 1, borderLeftColor: '#EEF2EF' },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontFamily: F700, fontSize: 10, color: MUTED },
  statValue: { fontFamily: F800, fontSize: 12.5, color: INK },

  /* AI banner */
  aiCard: {
    borderWidth: 1,
    borderColor: '#CFF0DF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiFace: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: 'rgba(12,29,22,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  aiAntennaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GREEN },
  aiAntennaStem: { width: 2, height: 4, backgroundColor: GREEN },
  aiHead: {
    width: 26,
    height: 19,
    borderRadius: 8,
    backgroundColor: INK,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  aiEye: { width: 4, height: 6, borderRadius: 2, backgroundColor: '#3DF0A6' },
  aiTitle: { fontFamily: F800, fontSize: 14, color: INK },
  aiSub: { fontFamily: F600, fontSize: 11.5, color: '#5F6F68' },
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: GREEN,
    flexShrink: 0,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 4,
  },
  aiCtaText: { fontFamily: F800, fontSize: 13, color: '#FFFFFF' },

  /* Row groups */
  group: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(12,29,22,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: F800, fontSize: 14.5, color: INK },
  rowSub: { fontFamily: F600, fontSize: 11.5, color: MUTED },
  divider: { height: 1, backgroundColor: '#F0F4F1', marginHorizontal: 16 },

  /* Logout */
  logoutBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { fontFamily: F800, fontSize: 14.5, color: '#D64545' },
});
