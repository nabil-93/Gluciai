/* ────────────────────────────────────────────────────────────
 * WORKOUT LIBRARY — curated, never AI-invented.
 *
 * The AI is allowed to CHOOSE a session from this file and to order the
 * blocks, but it may never invent an exercise or a video URL: hallucinated
 * YouTube IDs are dead links, and a made-up movement is how someone with
 * diabetic neuropathy or retinopathy gets hurt.
 *
 * On the videos: each exercise carries a search PHRASE rather than a hard
 * video id. A pinned id rots the day the uploader deletes it, while a
 * search link is permanent and lands on current, well-ranked tutorials.
 * Swap `video` for a specific id later if you want to pin a channel.
 * ──────────────────────────────────────────────────────────── */

export type WorkoutLevel = 'beginner' | 'intermediate' | 'advanced';
export type WorkoutPlace = 'home' | 'gym' | 'outdoor';
export type MuscleGroup = 'full' | 'legs' | 'push' | 'pull' | 'core' | 'cardio';

export interface Exercise {
  id: string;
  name_fr: string;
  name_ar: string;
  name_en: string;
  group: MuscleGroup;
  place: WorkoutPlace[];
  level: WorkoutLevel;
  /** Search phrase used to build the tutorial link. */
  video: string;
  /** One-line safety or form cue shown under the exercise. */
  cue_fr?: string;
  cue_ar?: string;
}

/** Permanent tutorial link for an exercise (search, so it never 404s). */
export function videoUrl(ex: Exercise): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.video)}`;
}

export const EXERCISES: Exercise[] = [
  /* ── Legs ── */
  {
    id: 'squat_body',
    name_fr: 'Squat au poids du corps',
    name_ar: 'سكوات بوزن الجسم',
    name_en: 'Bodyweight squat',
    group: 'legs',
    place: ['home', 'gym', 'outdoor'],
    level: 'beginner',
    video: 'bodyweight squat proper form tutorial',
    cue_fr: 'Genoux dans l’axe des pieds, dos droit.',
    cue_ar: 'الركبتين في محاذاة الرجلين، الظهر مستقيم.',
  },
  {
    id: 'lunge',
    name_fr: 'Fentes avant',
    name_ar: 'الطعنات الأمامية',
    name_en: 'Forward lunge',
    group: 'legs',
    place: ['home', 'gym', 'outdoor'],
    level: 'beginner',
    video: 'forward lunge proper form tutorial',
  },
  {
    id: 'glute_bridge',
    name_fr: 'Pont fessier',
    name_ar: 'جسر المؤخرة',
    name_en: 'Glute bridge',
    group: 'legs',
    place: ['home', 'gym'],
    level: 'beginner',
    video: 'glute bridge exercise tutorial',
  },
  {
    id: 'leg_press',
    name_fr: 'Presse à cuisses',
    name_ar: 'ضغط الأرجل',
    name_en: 'Leg press',
    group: 'legs',
    place: ['gym'],
    level: 'intermediate',
    video: 'leg press machine proper form',
  },
  {
    id: 'goblet_squat',
    name_fr: 'Goblet squat (haltère)',
    name_ar: 'سكوات بالدمبل',
    name_en: 'Goblet squat',
    group: 'legs',
    place: ['gym', 'home'],
    level: 'intermediate',
    video: 'goblet squat dumbbell tutorial',
  },

  /* ── Push ── */
  {
    id: 'pushup_knee',
    name_fr: 'Pompes sur genoux',
    name_ar: 'ضغط على الركبتين',
    name_en: 'Knee push-up',
    group: 'push',
    place: ['home', 'gym'],
    level: 'beginner',
    video: 'knee push up beginner tutorial',
  },
  {
    id: 'pushup',
    name_fr: 'Pompes',
    name_ar: 'تمرين الضغط',
    name_en: 'Push-up',
    group: 'push',
    place: ['home', 'gym', 'outdoor'],
    level: 'intermediate',
    video: 'push up proper form tutorial',
  },
  {
    id: 'db_press',
    name_fr: 'Développé haltères',
    name_ar: 'ضغط الصدر بالدمبل',
    name_en: 'Dumbbell press',
    group: 'push',
    place: ['gym'],
    level: 'intermediate',
    video: 'dumbbell bench press form',
  },
  {
    id: 'shoulder_press',
    name_fr: 'Développé épaules',
    name_ar: 'ضغط الأكتاف',
    name_en: 'Shoulder press',
    group: 'push',
    place: ['gym', 'home'],
    level: 'intermediate',
    video: 'dumbbell shoulder press form',
  },

  /* ── Pull ── */
  {
    id: 'band_row',
    name_fr: 'Tirage élastique',
    name_ar: 'سحب بالمطاط',
    name_en: 'Resistance band row',
    group: 'pull',
    place: ['home'],
    level: 'beginner',
    video: 'resistance band row tutorial',
  },
  {
    id: 'db_row',
    name_fr: 'Rowing haltère',
    name_ar: 'تجديف بالدمبل',
    name_en: 'Dumbbell row',
    group: 'pull',
    place: ['gym', 'home'],
    level: 'intermediate',
    video: 'one arm dumbbell row form',
  },
  {
    id: 'lat_pulldown',
    name_fr: 'Tirage vertical',
    name_ar: 'السحب العمودي',
    name_en: 'Lat pulldown',
    group: 'pull',
    place: ['gym'],
    level: 'intermediate',
    video: 'lat pulldown proper form',
  },

  /* ── Core ── */
  {
    id: 'plank',
    name_fr: 'Gainage (planche)',
    name_ar: 'تمرين البلانك',
    name_en: 'Plank',
    group: 'core',
    place: ['home', 'gym', 'outdoor'],
    level: 'beginner',
    video: 'plank exercise proper form',
    cue_fr: 'Ne bloque pas ta respiration.',
    cue_ar: 'ما تحبسش النفس ديالك.',
  },
  {
    id: 'dead_bug',
    name_fr: 'Dead bug',
    name_ar: 'تمرين الحشرة الميتة',
    name_en: 'Dead bug',
    group: 'core',
    place: ['home', 'gym'],
    level: 'beginner',
    video: 'dead bug core exercise tutorial',
  },
  {
    id: 'side_plank',
    name_fr: 'Gainage latéral',
    name_ar: 'البلانك الجانبي',
    name_en: 'Side plank',
    group: 'core',
    place: ['home', 'gym'],
    level: 'intermediate',
    video: 'side plank proper form',
  },

  /* ── Cardio ── */
  {
    id: 'walk',
    name_fr: 'Marche rapide',
    name_ar: 'المشي السريع',
    name_en: 'Brisk walk',
    group: 'cardio',
    place: ['outdoor', 'gym'],
    level: 'beginner',
    video: 'brisk walking workout for beginners',
  },
  {
    id: 'march_place',
    name_fr: 'Marche sur place',
    name_ar: 'المشي في المكان',
    name_en: 'Marching in place',
    group: 'cardio',
    place: ['home'],
    level: 'beginner',
    video: 'marching in place low impact cardio',
  },
  {
    id: 'bike',
    name_fr: 'Vélo',
    name_ar: 'الدراجة',
    name_en: 'Cycling',
    group: 'cardio',
    place: ['gym', 'outdoor'],
    level: 'beginner',
    video: 'stationary bike workout beginner',
  },
  {
    id: 'step_up',
    name_fr: 'Montées de marche',
    name_ar: 'صعود الدرج',
    name_en: 'Step-ups',
    group: 'cardio',
    place: ['home', 'gym', 'outdoor'],
    level: 'intermediate',
    video: 'step up exercise tutorial',
  },
  {
    id: 'jumping_jack',
    name_fr: 'Jumping jacks',
    name_ar: 'القفز المتباعد',
    name_en: 'Jumping jacks',
    group: 'cardio',
    place: ['home', 'outdoor'],
    level: 'intermediate',
    video: 'jumping jacks proper form',
  },
];

export interface WorkoutBlock {
  exerciseId: string;
  sets: number;
  /** Reps per set, or null when the block is timed. */
  reps: number | null;
  /** Seconds per set for timed blocks (plank, cardio). */
  seconds: number | null;
  restSeconds: number;
}

export interface WorkoutSession {
  id: string;
  title_fr: string;
  title_ar: string;
  title_en: string;
  place: WorkoutPlace;
  level: WorkoutLevel;
  /** Rough duration in minutes, warm-up included. */
  minutes: number;
  /** Rough energy cost — feeds the day's budget, never a promise. */
  estKcal: number;
  focus: MuscleGroup;
  blocks: WorkoutBlock[];
}

const b = (
  exerciseId: string,
  sets: number,
  reps: number | null,
  seconds: number | null,
  restSeconds = 60
): WorkoutBlock => ({ exerciseId, sets, reps, seconds, restSeconds });

export const SESSIONS: WorkoutSession[] = [
  {
    id: 'home_full_beg',
    title_fr: 'Corps entier — maison, débutant',
    title_ar: 'الجسم كامل — في الدار، مبتدئ',
    title_en: 'Full body — home, beginner',
    place: 'home',
    level: 'beginner',
    minutes: 25,
    estKcal: 150,
    focus: 'full',
    blocks: [
      b('march_place', 1, null, 180, 30),
      b('squat_body', 3, 10, null),
      b('pushup_knee', 3, 8, null),
      b('glute_bridge', 3, 12, null),
      b('plank', 3, null, 20, 45),
    ],
  },
  {
    id: 'home_full_int',
    title_fr: 'Corps entier — maison, intermédiaire',
    title_ar: 'الجسم كامل — في الدار، متوسط',
    title_en: 'Full body — home, intermediate',
    place: 'home',
    level: 'intermediate',
    minutes: 35,
    estKcal: 240,
    focus: 'full',
    blocks: [
      b('jumping_jack', 2, null, 45, 30),
      b('squat_body', 4, 15, null),
      b('pushup', 4, 10, null),
      b('band_row', 3, 12, null),
      b('lunge', 3, 10, null),
      b('side_plank', 3, null, 30, 40),
    ],
  },
  {
    id: 'home_cardio_beg',
    title_fr: 'Cardio doux — maison',
    title_ar: 'كارديو خفيف — في الدار',
    title_en: 'Gentle cardio — home',
    place: 'home',
    level: 'beginner',
    minutes: 20,
    estKcal: 120,
    focus: 'cardio',
    blocks: [
      b('march_place', 4, null, 120, 45),
      b('step_up', 3, 12, null),
      b('dead_bug', 3, 10, null),
    ],
  },
  {
    id: 'gym_full_beg',
    title_fr: 'Corps entier — salle, débutant',
    title_ar: 'الجسم كامل — القاعة، مبتدئ',
    title_en: 'Full body — gym, beginner',
    place: 'gym',
    level: 'beginner',
    minutes: 40,
    estKcal: 220,
    focus: 'full',
    blocks: [
      b('bike', 1, null, 300, 60),
      b('leg_press', 3, 12, null, 90),
      b('lat_pulldown', 3, 12, null, 90),
      b('shoulder_press', 3, 10, null, 90),
      b('plank', 3, null, 30, 45),
    ],
  },
  {
    id: 'gym_full_int',
    title_fr: 'Corps entier — salle, intermédiaire',
    title_ar: 'الجسم كامل — القاعة، متوسط',
    title_en: 'Full body — gym, intermediate',
    place: 'gym',
    level: 'intermediate',
    minutes: 50,
    estKcal: 320,
    focus: 'full',
    blocks: [
      b('bike', 1, null, 300, 60),
      b('goblet_squat', 4, 12, null, 90),
      b('db_press', 4, 10, null, 90),
      b('db_row', 4, 10, null, 90),
      b('lunge', 3, 12, null),
      b('side_plank', 3, null, 40, 40),
    ],
  },
  {
    id: 'outdoor_walk',
    title_fr: 'Marche active — dehors',
    title_ar: 'مشي نشيط — بره',
    title_en: 'Active walk — outdoor',
    place: 'outdoor',
    level: 'beginner',
    minutes: 30,
    estKcal: 140,
    focus: 'cardio',
    blocks: [b('walk', 1, null, 1800, 0)],
  },

  /* ── Depth, so the rotation has somewhere to go ──────────────
   * Two sessions per place meant the same workout every other training day,
   * and the fastest way to abandon a program is boredom. Each bucket now
   * holds three to five sessions built from the SAME curated exercises —
   * different focus, different order, same safety. */

  {
    id: 'home_lower_beg',
    title_fr: 'Bas du corps — maison',
    title_ar: 'الجزء السفلي — في الدار',
    title_en: 'Lower body — home',
    place: 'home',
    level: 'beginner',
    minutes: 25,
    estKcal: 150,
    focus: 'legs',
    blocks: [
      b('march_place', 1, null, 150, 30),
      b('squat_body', 3, 12, null),
      b('lunge', 3, 8, null),
      b('glute_bridge', 3, 15, null),
      b('plank', 2, null, 20, 45),
    ],
  },
  {
    id: 'home_upper_beg',
    title_fr: 'Haut du corps — maison',
    title_ar: 'الجزء العلوي — في الدار',
    title_en: 'Upper body — home',
    place: 'home',
    level: 'beginner',
    minutes: 22,
    estKcal: 130,
    focus: 'push',
    blocks: [
      b('march_place', 1, null, 150, 30),
      b('pushup_knee', 3, 8, null),
      b('band_row', 3, 12, null),
      b('dead_bug', 3, 10, null),
      b('plank', 3, null, 20, 45),
    ],
  },
  {
    id: 'home_core_beg',
    title_fr: 'Ceinture abdominale — maison',
    title_ar: 'عضلات البطن — في الدار',
    title_en: 'Core — home',
    place: 'home',
    level: 'beginner',
    minutes: 18,
    estKcal: 110,
    focus: 'core',
    blocks: [
      b('march_place', 2, null, 90, 40),
      b('plank', 3, null, 25, 45),
      b('dead_bug', 3, 12, null),
      b('glute_bridge', 3, 12, null),
    ],
  },
  {
    id: 'home_hiit_int',
    title_fr: 'Circuit intensif — maison',
    title_ar: 'دورة مكثفة — في الدار',
    title_en: 'HIIT circuit — home',
    place: 'home',
    level: 'intermediate',
    minutes: 30,
    estKcal: 280,
    focus: 'cardio',
    blocks: [
      b('jumping_jack', 4, null, 45, 30),
      b('squat_body', 4, 20, null, 45),
      b('pushup', 3, 12, null, 45),
      b('step_up', 3, 15, null, 45),
      b('plank', 3, null, 35, 40),
    ],
  },
  {
    id: 'home_lower_int',
    title_fr: 'Bas du corps — maison, intermédiaire',
    title_ar: 'الجزء السفلي — في الدار، متوسط',
    title_en: 'Lower body — home, intermediate',
    place: 'home',
    level: 'intermediate',
    minutes: 35,
    estKcal: 250,
    focus: 'legs',
    blocks: [
      b('jumping_jack', 2, null, 45, 30),
      b('goblet_squat', 4, 12, null),
      b('lunge', 4, 12, null),
      b('glute_bridge', 4, 15, null),
      b('side_plank', 3, null, 30, 40),
    ],
  },
  {
    id: 'home_upper_int',
    title_fr: 'Haut du corps — maison, intermédiaire',
    title_ar: 'الجزء العلوي — في الدار، متوسط',
    title_en: 'Upper body — home, intermediate',
    place: 'home',
    level: 'intermediate',
    minutes: 35,
    estKcal: 230,
    focus: 'push',
    blocks: [
      b('jumping_jack', 2, null, 45, 30),
      b('pushup', 4, 12, null),
      b('shoulder_press', 3, 10, null),
      b('db_row', 4, 10, null),
      b('side_plank', 3, null, 30, 40),
    ],
  },

  {
    id: 'gym_lower_beg',
    title_fr: 'Bas du corps — salle',
    title_ar: 'الجزء السفلي — القاعة',
    title_en: 'Lower body — gym',
    place: 'gym',
    level: 'beginner',
    minutes: 35,
    estKcal: 200,
    focus: 'legs',
    blocks: [
      b('bike', 1, null, 300, 60),
      b('leg_press', 3, 12, null, 90),
      b('squat_body', 3, 12, null),
      b('glute_bridge', 3, 15, null),
      b('plank', 3, null, 30, 45),
    ],
  },
  {
    id: 'gym_upper_beg',
    title_fr: 'Haut du corps — salle',
    title_ar: 'الجزء العلوي — القاعة',
    title_en: 'Upper body — gym',
    place: 'gym',
    level: 'beginner',
    minutes: 35,
    estKcal: 190,
    focus: 'push',
    blocks: [
      b('bike', 1, null, 240, 60),
      b('lat_pulldown', 3, 12, null, 90),
      b('db_press', 3, 10, null, 90),
      b('db_row', 3, 10, null, 90),
      b('plank', 3, null, 30, 45),
    ],
  },
  {
    id: 'gym_push_int',
    title_fr: 'Poussée — salle',
    title_ar: 'الدفع — القاعة',
    title_en: 'Push day — gym',
    place: 'gym',
    level: 'intermediate',
    minutes: 45,
    estKcal: 300,
    focus: 'push',
    blocks: [
      b('bike', 1, null, 300, 60),
      b('db_press', 4, 10, null, 90),
      b('shoulder_press', 4, 10, null, 90),
      b('pushup', 3, 12, null),
      b('side_plank', 3, null, 40, 40),
    ],
  },
  {
    id: 'gym_pull_int',
    title_fr: 'Tirage — salle',
    title_ar: 'السحب — القاعة',
    title_en: 'Pull day — gym',
    place: 'gym',
    level: 'intermediate',
    minutes: 45,
    estKcal: 290,
    focus: 'pull',
    blocks: [
      b('bike', 1, null, 300, 60),
      b('lat_pulldown', 4, 10, null, 90),
      b('db_row', 4, 10, null, 90),
      b('dead_bug', 3, 12, null),
      b('plank', 3, null, 45, 45),
    ],
  },

  {
    id: 'outdoor_intervals_beg',
    title_fr: 'Marche fractionnée — dehors',
    title_ar: 'مشي متقطع — بره',
    title_en: 'Interval walk — outdoor',
    place: 'outdoor',
    level: 'beginner',
    minutes: 30,
    estKcal: 180,
    focus: 'cardio',
    blocks: [
      b('walk', 1, null, 600, 0),
      b('step_up', 3, 12, null, 45),
      b('walk', 1, null, 600, 0),
      b('squat_body', 3, 12, null),
    ],
  },
  {
    id: 'outdoor_circuit_beg',
    title_fr: 'Circuit au parc — dehors',
    title_ar: 'دورة فالحديقة — بره',
    title_en: 'Park circuit — outdoor',
    place: 'outdoor',
    level: 'beginner',
    minutes: 28,
    estKcal: 170,
    focus: 'full',
    blocks: [
      b('walk', 1, null, 300, 30),
      b('squat_body', 3, 12, null),
      b('lunge', 3, 10, null),
      b('plank', 3, null, 25, 45),
      b('walk', 1, null, 300, 0),
    ],
  },
  {
    id: 'outdoor_circuit_int',
    title_fr: 'Circuit au parc — intermédiaire',
    title_ar: 'دورة فالحديقة — متوسط',
    title_en: 'Park circuit — intermediate',
    place: 'outdoor',
    level: 'intermediate',
    minutes: 40,
    estKcal: 300,
    focus: 'full',
    blocks: [
      b('walk', 1, null, 300, 30),
      b('squat_body', 4, 20, null, 45),
      b('pushup', 4, 12, null, 45),
      b('lunge', 4, 12, null, 45),
      b('step_up', 3, 15, null, 45),
      b('plank', 3, null, 40, 40),
    ],
  },
  {
    id: 'outdoor_cardio_int',
    title_fr: 'Cardio soutenu — dehors',
    title_ar: 'كارديو قوي — بره',
    title_en: 'Sustained cardio — outdoor',
    place: 'outdoor',
    level: 'intermediate',
    minutes: 35,
    estKcal: 260,
    focus: 'cardio',
    blocks: [
      b('walk', 1, null, 300, 30),
      b('jumping_jack', 3, null, 45, 30),
      b('walk', 1, null, 1200, 0),
      b('step_up', 3, 15, null, 45),
    ],
  },
];

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function getSession(id: string): WorkoutSession | undefined {
  return SESSIONS.find((s) => s.id === id);
}

/** Sessions that fit where the patient trains and how trained they are. */
export function pickSessions(place: WorkoutPlace | 'mixed', level: WorkoutLevel): WorkoutSession[] {
  const byPlace = SESSIONS.filter((s) => place === 'mixed' || s.place === place);
  const exact = byPlace.filter((s) => s.level === level);
  return exact.length ? exact : byPlace;
}

/* ────────────────────────────────────────────────────────────
 * GLUCOSE SAFETY AROUND EXERCISE
 *
 * Movement lowers glucose for hours, and a patient on insulin can go low
 * mid-session. These thresholds follow standard diabetes-and-exercise
 * guidance and are deliberately conservative: the app tells the patient to
 * fuel or to stop, never to "push through".
 * ──────────────────────────────────────────────────────────── */

export type PreWorkoutVerdict = 'fuel' | 'go' | 'caution' | 'stop';

/** What to do with the glucose reading taken just before training. */
export function preWorkoutCheck(glucose: number | null | undefined): {
  verdict: PreWorkoutVerdict;
  /** i18n key under `program.pre*` describing the action. */
  key: string;
} {
  if (glucose == null) return { verdict: 'caution', key: 'preUnknown' };
  if (glucose < 70) return { verdict: 'stop', key: 'preHypo' };
  if (glucose < 100) return { verdict: 'fuel', key: 'preLow' };
  if (glucose > 300) return { verdict: 'stop', key: 'preVeryHigh' };
  if (glucose > 250) return { verdict: 'caution', key: 'preHigh' };
  return { verdict: 'go', key: 'preOk' };
}
