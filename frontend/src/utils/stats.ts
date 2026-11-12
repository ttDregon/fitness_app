// Статистика по личному журналу тренировок: рекорды по упражнениям, тоннаж, недельная
// активность и серия. Чистые функции — считаются в AppContext через useMemo от history,
// чтобы не пересчитываться на каждый заход во вкладку (экраны размонтируются).
import type { WorkoutData } from '../types';
import { ymd, parseYmd } from './date';

/** Ключ упражнения для сравнения: регистр, «ё» и лишние пробелы не важны. */
export const exerciseKey = (name: string) =>
  (name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

export const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Оценка разового максимума (формула Эпли). На >12 повторах формула врёт — режем. */
export const estimate1RM = (weight: number, reps: number) => {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
};

export interface SetLite { weight: number; reps: number }

export interface ExerciseStat {
  key: string;
  name: string;
  sets: number;            // подходов за всё время
  days: number;            // в скольких тренировках встречалось
  bestWeight: number;      // максимальный рабочий вес
  bestWeightReps: number;  // ...и на сколько повторов
  bestWeightDate: string;
  best1RM: number;         // лучшая оценка 1ПМ
  maxReps: number;         // для упражнений со своим весом
  lastDate: string;        // последняя тренировка с этим упражнением (до сегодняшней, если была)
  lastSets: SetLite[];
}

type DayGroups = { keys: string[]; map: Map<string, WorkoutData[]> };

export function computeExerciseStats({ keys, map }: DayGroups, today = ymd(new Date())): Record<string, ExerciseStat> {
  const stats: Record<string, ExerciseStat> = {};
  for (const day of keys) { // keys отсортированы по возрастанию
    const perExercise = new Map<string, SetLite[]>();
    for (const set of map.get(day) || []) {
      const key = exerciseKey(set.exercise);
      if (!key) continue;
      const w = num(set.weight);
      const r = num(set.reps);
      const st = stats[key] || (stats[key] = {
        key, name: capFirst(String(set.exercise).trim()), sets: 0, days: 0,
        bestWeight: 0, bestWeightReps: 0, bestWeightDate: '', best1RM: 0, maxReps: 0,
        lastDate: '', lastSets: [],
      });
      st.sets += 1;
      if (w > st.bestWeight || (w === st.bestWeight && w > 0 && r > st.bestWeightReps)) {
        st.bestWeight = w; st.bestWeightReps = r; st.bestWeightDate = day;
      }
      st.best1RM = Math.max(st.best1RM, estimate1RM(w, r));
      st.maxReps = Math.max(st.maxReps, r);
      const list = perExercise.get(key) || [];
      list.push({ weight: w, reps: r });
      perExercise.set(key, list);
    }
    perExercise.forEach((sets, key) => {
      const st = stats[key];
      st.days += 1;
      // «Прошлый раз» — последняя тренировка ДО сегодняшней: сегодняшние подходы ты и так
      // видишь, а для прогрессии нагрузки нужен именно прошлый раз.
      if (day !== today || !st.lastDate) { st.lastDate = day; st.lastSets = sets; }
    });
  }
  return stats;
}

const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // неделя с понедельника
  return x;
};

export interface WeekBucket { start: string; label: string; workouts: number; sets: number; volume: number }

export interface WorkoutSummary {
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;   // Σ вес × повторы, кг
  weekWorkouts: number;
  weekSets: number;
  weekVolume: number;
  weekStreak: number;    // недель подряд хотя бы с одной тренировкой
  weeks: WeekBucket[];   // последние 8 недель, от старых к новым
  lastWorkoutDate: string | null;
}

export function computeWorkoutSummary({ keys, map }: DayGroups, now = new Date()): WorkoutSummary {
  const byWeek = new Map<string, { workouts: number; sets: number; volume: number }>();
  let totalWorkouts = 0, totalSets = 0, totalVolume = 0;
  for (const day of keys) {
    const sets = map.get(day) || [];
    if (!sets.length) continue;
    totalWorkouts += 1;
    totalSets += sets.length;
    const vol = sets.reduce((a, s) => a + num(s.weight) * num(s.reps), 0);
    totalVolume += vol;
    const wk = ymd(startOfWeek(parseYmd(day)));
    const b = byWeek.get(wk) || { workouts: 0, sets: 0, volume: 0 };
    b.workouts += 1; b.sets += sets.length; b.volume += vol;
    byWeek.set(wk, b);
  }

  const thisWeek = startOfWeek(now);
  const weeks: WeekBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    const start = ymd(d);
    const b = byWeek.get(start) || { workouts: 0, sets: 0, volume: 0 };
    weeks.push({ start, label: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`, ...b });
  }

  // Серия: текущая неделя ещё идёт — если в ней пока пусто, серия не обрывается.
  let weekStreak = 0;
  const cursor = new Date(thisWeek);
  if (!byWeek.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 7);
  while (byWeek.has(ymd(cursor))) { weekStreak += 1; cursor.setDate(cursor.getDate() - 7); }

  const cur = byWeek.get(ymd(thisWeek)) || { workouts: 0, sets: 0, volume: 0 };
  return {
    totalWorkouts, totalSets, totalVolume: Math.round(totalVolume),
    weekWorkouts: cur.workouts, weekSets: cur.sets, weekVolume: Math.round(cur.volume),
    weekStreak, weeks,
    lastWorkoutDate: keys.length ? keys[keys.length - 1] : null,
  };
}

/** 12 345 → «12,3 т», 850 → «850 кг». */
export const formatVolume = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 100000 ? 0 : 1).replace('.', ',')} т` : `${Math.round(kg)} кг`;

/** «80 кг × 8» или «× 20» для упражнений без веса. */
export const formatSet = (s: SetLite) => (s.weight > 0 ? `${+s.weight.toFixed(2)} кг × ${s.reps}` : `× ${s.reps}`);
