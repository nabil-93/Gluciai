import type {
  ActivityLog,
  GlucoseLog,
  InsulinLog,
  MealScan,
  Profile,
} from '@/types';

/** Minimal translate signature (i18next TFunction), avoids a hard import here. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface Insight {
  icon: string;
  title: string;
  body: string;
  /** Route to open when tapped */
  href?: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function hoursAgo(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

/**
 * Rule-based coach: picks the most relevant insight from the user's
 * real data. Priority: safety first (hypo/hyper), then habits, then
 * encouragement.
 */
export function getDailyInsight(
  glucoseLogs: GlucoseLog[],
  insulinLogs: InsulinLog[],
  meals: MealScan[],
  activityLogs: ActivityLog[],
  profile: Profile | null,
  t: TFn
): Insight {
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const todayGlucose = glucoseLogs.filter((g) => isToday(g.created_at));
  const last = todayGlucose[0];

  // 1 — Hypo: safety first
  if (last && last.value < low && hoursAgo(last.created_at) < 2) {
    return {
      icon: '🚨',
      title: t('insights.hypoTitle'),
      body: t('insights.hypoBody', { value: last.value }),
      href: '/log-glucose',
      tone: 'danger',
    };
  }

  // 2 — Hyper without recent rapid insulin
  if (last && last.value > high && hoursAgo(last.created_at) < 3) {
    const recentRapid = insulinLogs.some(
      (l) => l.insulin_type === 'rapid' && hoursAgo(l.created_at) < 3
    );
    if (!recentRapid) {
      return {
        icon: '📈',
        title: t('insights.hyperTitle'),
        body: t('insights.hyperBody', { value: last.value }),
        href: '/bolus',
        tone: 'warning',
      };
    }
  }

  // 3 — High-GI meal recently → remind post-meal check
  const lastMeal = meals.find((m) => isToday(m.created_at));
  if (
    lastMeal &&
    lastMeal.result.glycemic_index > 65 &&
    hoursAgo(lastMeal.created_at) > 1.5 &&
    hoursAgo(lastMeal.created_at) < 3 &&
    (!last || hoursAgo(last.created_at) > hoursAgo(lastMeal.created_at))
  ) {
    return {
      icon: '⏱️',
      title: t('insights.postMealTitle'),
      body: t('insights.postMealBody', { food: lastMeal.result.food_name }),
      href: '/log-glucose',
      tone: 'warning',
    };
  }

  // 4 — Sugar overload today
  const sugarToday = meals
    .filter((m) => isToday(m.created_at))
    .reduce((s, m) => s + (m.result.sugar ?? 0), 0);
  if (sugarToday > 50) {
    return {
      icon: '🍬',
      title: t('insights.sugarTitle'),
      body: t('insights.sugarBody', { grams: Math.round(sugarToday) }),
      href: '/nutrition',
      tone: 'warning',
    };
  }

  // 5 — Great time in range
  if (todayGlucose.length >= 3) {
    const tir =
      todayGlucose.filter((g) => g.value >= low && g.value <= high).length /
      todayGlucose.length;
    if (tir >= 0.7) {
      return {
        icon: '🏆',
        title: t('insights.greatTitle'),
        body: t('insights.greatBody', {
          percent: Math.round(tir * 100),
          low,
          high,
        }),
        href: '/glucose',
        tone: 'success',
      };
    }
  }

  // 6 — Activity effect reminder
  const activityToday = activityLogs.find((a) => isToday(a.created_at));
  if (activityToday && hoursAgo(activityToday.created_at) < 4) {
    return {
      icon: '🏃',
      title: t('insights.activityTitle'),
      body: t('insights.activityBody', { min: activityToday.duration_min }),
      href: '/log-glucose',
      tone: 'success',
    };
  }

  // 7 — Morning fasting reminder
  if (todayGlucose.length === 0) {
    const hour = new Date().getHours();
    return {
      icon: '🌅',
      title: hour < 11 ? t('insights.fastingTitle') : t('insights.noMeasureTitle'),
      body:
        hour < 11 ? t('insights.fastingBody') : t('insights.noMeasureBody'),
      href: '/log-glucose',
      tone: 'info',
    };
  }

  // 8 — Default: log meals
  const mealsToday = meals.filter((m) => isToday(m.created_at));
  if (mealsToday.length === 0) {
    return {
      icon: '📸',
      title: t('insights.scanNextTitle'),
      body: t('insights.scanNextBody'),
      href: '/scan',
      tone: 'info',
    };
  }

  return {
    icon: '✨',
    title: t('insights.upToDateTitle'),
    body: t('insights.upToDateBody', {
      glucose: todayGlucose.length,
      meals: mealsToday.length,
    }),
    href: '/glucose',
    tone: 'info',
  };
}
