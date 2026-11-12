// «Снимок» приложения для ИИ-компаньона. Собирается на клиенте из того, что уже лежит в
// AppContext (журнал, рекорды, вес, питание и вода за сегодня, план тренера, расписание,
// незаконченный конструктор), и уходит с каждым сообщением чата. Благодаря этому на
// «пересмотри мою тренировку и посоветуй, что сделать сегодня» компаньон отвечает по
// реальным записям, а не переспрашивает. Формат — компактный текст по-русски: модели
// так проще, а размер держим в пределах ~6–8 тыс. символов (бэкенд режет на 9000).
import type {
  WorkoutData, MealItem, MealLogRow, TrainingSession, WorkoutBuilderBlock, Macros,
} from '../types';
import { EXERCISES } from '../data/exercises';
import { exerciseKey, formatSet, formatVolume, type ExerciseStat, type WorkoutSummary } from './stats';
import { getCurrentDateString, parseYmd, plural } from './date';

const LIBRARY_GROUP = new Map(EXERCISES.map(e => [exerciseKey(e.name), e.group]));

// Свои упражнения (не из библиотеки) и разбор ИИ («жим 100 5х5») — по ключевым словам.
const KEYWORD_GROUPS: [RegExp, string][] = [
  [/присед|выпад|жим ногами|разгибание ног|сгибание ног|ног|бедр|квадрицеп/, 'Ноги'],
  [/ягодиц|ягодичн|мостик|гуд ?морнинг/, 'Ягодицы'],
  [/икр|носк/, 'Икры'],
  [/становая|тяга|подтягиван|гиперэкстенз|спин|шраги|пуловер/, 'Спина'],
  [/жим.*(леж|наклон)|отжиман|сведени|бабочк|кроссовер|груд|брусь/, 'Грудь'],
  [/жим.*(стоя|сидя|над головой)|армейск|мах|плеч|дельт|протяжк/, 'Плечи'],
  [/бицепс|сгибани.*рук|молот/, 'Бицепс'],
  [/трицепс|французск|разгибани.*рук/, 'Трицепс'],
  [/пресс|скручиван|планк|подъем ног/, 'Пресс'],
  [/бег|велос|эллипс|кардио|скакалк|бёрпи|берпи|гребл/, 'Кардио'],
];

export const muscleGroupOf = (exercise: string): string => {
  const key = exerciseKey(exercise);
  const lib = LIBRARY_GROUP.get(key);
  if (lib) return lib;
  for (const [re, g] of KEYWORD_GROUPS) if (re.test(key)) return g;
  return 'Другое';
};

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

const daysAgo = (day: string, today: string) =>
  Math.round((parseYmd(today).getTime() - parseYmd(day).getTime()) / 86400000);

const agoLabel = (n: number) =>
  n <= 0 ? 'сегодня' : n === 1 ? 'вчера' : `${n} ${plural(n, ['день', 'дня', 'дней'])} назад`;

const MEAL_LABELS: Record<string, string> = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snack: 'перекус' };

export interface CompanionInputs {
  name: string;
  role: string | null;
  goal: string;
  currentWeight: number;
  startWeight: number | null;
  targetWeight: number | null;
  weightLogs: { weight: number; created_at: string }[];
  dailyCalorieNorm: number;
  maintenanceCalories: number;
  dailyMacros: Macros;
  consumedCalories: number;
  consumedMacros: Macros;
  selfMeals: MealLogRow[];
  assignedMeals: MealItem[];
  waterLiters: number;
  dayGroups: { keys: string[]; map: Map<string, WorkoutData[]> };
  exerciseStats: Record<string, ExerciseStat>;
  summary: WorkoutSummary;
  trainerPlanToday: WorkoutData[] | null;
  upcomingSessions: TrainingSession[];
  builderBlocks: WorkoutBuilderBlock[];
}

export function buildCompanionContext(p: CompanionInputs, now = new Date()): string {
  const today = getCurrentDateString();
  const L: string[] = [];
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  L.push(`Сейчас: ${today} (${WEEKDAYS[now.getDay()]}), ${hh}:${mm} по времени пользователя.`);
  L.push(`Роль: ${p.role === 'trainer' ? 'тренер (ведёт клиентов, но и сам тренируется)' : 'спортсмен'}.`);

  // --- Вес ---
  const goalLabel = p.goal === 'lose' ? 'похудение' : p.goal === 'gain' ? 'набор массы' : 'поддержание веса';
  L.push('', `ВЕС И ЦЕЛЬ (цель: ${goalLabel}):`);
  if (p.currentWeight > 0) {
    let line = `- Текущий вес: ${p.currentWeight} кг`;
    if (p.startWeight) line += `; стартовый (первая запись): ${p.startWeight} кг`;
    if (p.targetWeight) line += `; целевой: ${p.targetWeight} кг (осталось ${Math.abs(p.currentWeight - p.targetWeight).toFixed(1)} кг)`;
    L.push(line);
  } else L.push('- Вес не указан.');
  const logs = [...p.weightLogs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  if (logs.length >= 2) {
    const nowMs = now.getTime();
    const lastLog = logs[logs.length - 1];
    // Опорная точка — первое взвешивание внутри окна (и не само последнее): иначе
    // «динамика за 7 дней» при одном взвешивании за неделю всегда была бы 0.0.
    const ref = (days: number) => {
      const first = logs.find(l => new Date(l.created_at).getTime() >= nowMs - days * 86400000);
      return first && first !== lastLog ? first : undefined;
    };
    const last = lastLog.weight;
    const w7 = ref(7), w30 = ref(30);
    const fmt = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)} кг`;
    const parts: string[] = [];
    if (w7) parts.push(`за 7 дней ${fmt(last - w7.weight)}`);
    if (w30 && w30 !== w7) parts.push(`за 30 дней ${fmt(last - w30.weight)}`);
    if (parts.length) L.push(`- Динамика: ${parts.join(', ')}.`);
    L.push(`- Последние измерения: ${logs.slice(-5).map(l => `${l.created_at.slice(5, 10)} — ${l.weight}`).join('; ')}.`);
  }

  // --- Питание и вода сегодня ---
  L.push('', 'ПИТАНИЕ И ВОДА СЕГОДНЯ:');
  if (p.dailyCalorieNorm > 0) {
    const left = p.dailyCalorieNorm - p.consumedCalories;
    L.push(`- Съедено ${p.consumedCalories} из ${p.dailyCalorieNorm} ккал (${left >= 0 ? `осталось ${left}` : `перебор ${-left}`}); поддержка ≈ ${p.maintenanceCalories} ккал.`);
    L.push(`- БЖУ: белки ${p.consumedMacros.protein}/${p.dailyMacros.protein} г, жиры ${p.consumedMacros.fat}/${p.dailyMacros.fat} г, углеводы ${p.consumedMacros.carb}/${p.dailyMacros.carb} г.`);
  } else L.push(`- Съедено ${p.consumedCalories} ккал (норма не рассчитана — не хватает данных профиля).`);
  if (p.selfMeals.length) {
    L.push(`- Записи: ${p.selfMeals.slice(-8).map(m => `${MEAL_LABELS[m.meal_type || ''] || 'приём'}: ${String(m.name || '').slice(0, 60)} (${m.calories} ккал)`).join('; ')}.`);
  } else if (p.consumedCalories === 0) L.push('- Еда сегодня ещё не записана.');
  if (p.assignedMeals.length) {
    L.push(`- Меню от тренера: ${p.assignedMeals.map(m => `${MEAL_LABELS[m.meal_type || ''] || 'приём'} ${m.calories} ккал${m.eaten ? ' ✓ съедено' : ' — ещё не съедено'}`).join('; ')}.`);
  }
  L.push(`- Вода: ${p.waterLiters.toFixed(1)} л.`);

  // --- Тренировки ---
  const s = p.summary;
  L.push('', 'ТРЕНИРОВКИ (личный журнал):');
  if (!s.totalWorkouts) {
    L.push('- Журнал пуст: записанных тренировок ещё нет.');
  } else {
    const lastAgo = s.lastWorkoutDate ? daysAgo(s.lastWorkoutDate, today) : null;
    L.push(`- Всего тренировок: ${s.totalWorkouts}; на этой неделе: ${s.weekWorkouts}; серия: ${s.weekStreak} ${plural(s.weekStreak, ['неделя', 'недели', 'недель'])} подряд; последняя — ${lastAgo === null ? '—' : agoLabel(lastAgo)}.`);
    L.push(`- Тренировок по неделям (последние 8, от старых к новым): ${s.weeks.map(w => w.workouts).join(', ')}.`);

    // Когда последний раз работала каждая группа мышц — главное для «что делать сегодня».
    const lastByGroup = new Map<string, string>();
    for (const day of p.dayGroups.keys) {
      for (const set of p.dayGroups.map.get(day) || []) lastByGroup.set(muscleGroupOf(set.exercise), day);
    }
    const groupLine = [...lastByGroup.entries()]
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([g, d]) => `${g} — ${agoLabel(daysAgo(d, today))}`);
    if (groupLine.length) L.push(`- Группы мышц, когда тренировались последний раз: ${groupLine.join('; ')}.`);

    L.push('- Последние тренировки:');
    for (const day of p.dayGroups.keys.slice(-6).reverse()) {
      // Группируем по ключу (регистр/«ё» не важны), показываем первое написание.
      const byEx = new Map<string, { name: string; sets: WorkoutData[] }>();
      for (const set of p.dayGroups.map.get(day) || []) {
        const name = String(set.exercise || '').trim();
        const k = exerciseKey(name);
        if (!k) continue;
        const g = byEx.get(k) || { name, sets: [] };
        g.sets.push(set);
        byEx.set(k, g);
      }
      const exParts = [...byEx.values()].map(({ name, sets }) =>
        `${name}: ${sets.map(x => formatSet({ weight: Number(x.weight) || 0, reps: Number(x.reps) || 0 })).join(', ')}`);
      L.push(`  • ${day} (${agoLabel(daysAgo(day, today))}): ${exParts.join(' | ')}`);
    }

    const prs = Object.values(p.exerciseStats)
      .filter(e => e.bestWeight > 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);
    if (prs.length) {
      L.push(`- Рекорды (макс. вес): ${prs.map(e => `${e.name} ${e.bestWeight} кг × ${e.bestWeightReps}${e.best1RM > e.bestWeight ? ` (≈1ПМ ${Math.round(e.best1RM)})` : ''}`).join('; ')}.`);
    }
    L.push(`- Суммарный тоннаж: ${formatVolume(s.totalVolume)}; на этой неделе: ${formatVolume(s.weekVolume)}.`);
  }

  if (p.builderBlocks.length) {
    L.push(`- Сейчас в конструкторе (ещё не сохранено): ${p.builderBlocks.map(b => `${b.exercise} (${b.sets.length} подх., выполнено ${b.sets.filter(x => x.completed).length})`).join('; ')}.`);
  }

  // --- Тренер и расписание ---
  if (p.trainerPlanToday && p.trainerPlanToday.length) {
    const done = p.trainerPlanToday.filter(x => x.completed).length;
    const names = [...new Set(p.trainerPlanToday.map(x => x.exercise))];
    L.push('', `ПЛАН ОТ ТРЕНЕРА НА СЕГОДНЯ: ${names.join(', ')} — выполнено ${done} из ${p.trainerPlanToday.length} подходов.`);
  }
  if (p.upcomingSessions.length) {
    const list = p.upcomingSessions.slice(0, 5).map(x =>
      `${x.session_date} ${x.session_time}${p.role === 'trainer' ? ` — клиент ${x.client_name || ''}` : x.group_name ? ` (${x.group_name})` : ''}`);
    L.push('', `РАСПИСАНИЕ (ближайшие записи на тренировку): ${list.join('; ')}.`);
  }

  return L.join('\n').slice(0, 8500);
}
