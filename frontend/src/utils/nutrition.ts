// Расчёт дневной нормы калорий и БЖУ. Единое место для формулы — раньше она была
// продублирована в AppContext.tsx (fetchUserProfileData и settleCalorieWeight) и
// использовала белок как плоские 30% от калорий, что при высокой калорийности
// разгоняло цифру белка до небезопасных значений (пример: 91.4кг/поддержание →
// формула давала ~232г белка вместо разумных ~180г). Белок теперь считается от
// веса тела (г/кг) с жёстким клампом 1.6–2.2 г/кг — стандартный безопасный диапазон
// для активного взрослого без медицинского наблюдения.

export interface NutritionInputs {
  weight: number;
  height: number;
  age: number;
  gender: string; // 'male' | 'female'
  workoutsPerWeek?: string | null; // '1-2' | '3-4' | '5+' | null
  goal?: string | null; // 'lose' | 'gain' | 'maintain'
}

export interface NutritionTargets {
  bmr: number;
  maintenanceCalories: number; // TDEE без коррекции на цель
  dailyCalorieNorm: number; // с коррекцией на цель
  macros: { protein: number; fat: number; carb: number };
}

// Множители активности к BMR. Раньше стояли классические 1.375/1.55/1.725 — они описывают
// ОБРАЗ ЖИЗНИ целиком («умеренно активный» = работа на ногах + спорт 3–5 раз), а мы знаем
// только число тренировок в неделю, при том что у большинства сидячая работа. Плюс основной
// сценарий приложения — силовые, они сжигают меньше, чем кардио из исходных таблиц.
// Итог — поддержка завышалась на ~7–10%. Без тренировок остаётся «сидячий» 1.2.
const ACTIVITY_MULT: Record<string, number> = { '1-2': 1.3, '3-4': 1.45, '5+': 1.6 };

// Коррекция на цель — в процентах от поддержки, а не плоские ±500: для лёгкого человека
// −500 это почти треть рациона, а +500 при наборе даёт в основном жир.
const LOSE_DEFICIT = 0.2;     // дефицит 20%...
const LOSE_DEFICIT_MAX = 500; // ...но не больше 500 ккал (~0.5 кг/нед)
const GAIN_SURPLUS = 0.1;     // профицит 10% (~+250 ккал) — «чистый» набор
// Нижняя граница при похудении без врача (общепринятая: 1200 ж / 1500 м).
const MIN_CALORIES: Record<string, number> = { male: 1500, female: 1200 };

// Белок, г/кг веса тела, по цели — в пределах безопасного диапазона 1.6–2.2 г/кг.
const PROTEIN_G_PER_KG: Record<string, number> = { lose: 2.0, gain: 1.9, maintain: 1.6 };

export function computeNutritionTargets(p: NutritionInputs): NutritionTargets {
  const bmr = p.gender === 'male'
    ? (10 * p.weight) + (6.25 * p.height) - (5 * p.age) + 5
    : (10 * p.weight) + (6.25 * p.height) - (5 * p.age) - 161;

  const mult = ACTIVITY_MULT[p.workoutsPerWeek || ''] || 1.2;
  const maintenanceCalories = Math.round(bmr * mult);

  let cals = maintenanceCalories;
  if (p.goal === 'lose') {
    cals -= Math.min(LOSE_DEFICIT_MAX, maintenanceCalories * LOSE_DEFICIT);
    // не ниже безопасного минимума, но и не выше самой поддержки (у миниатюрных людей она < минимума)
    const floor = MIN_CALORIES[p.gender] ?? MIN_CALORIES.female;
    cals = Math.max(cals, Math.min(floor, maintenanceCalories));
  } else if (p.goal === 'gain') {
    cals += maintenanceCalories * GAIN_SURPLUS;
  }
  cals = Math.round(cals);

  const gPerKg = PROTEIN_G_PER_KG[p.goal || 'maintain'] ?? 1.6;
  const proteinG = Math.round(Math.min(p.weight * 2.2, Math.max(p.weight * 1.6, p.weight * gPerKg)));
  const proteinCals = proteinG * 4;
  const fatCals = cals * 0.25; // жир — 25% калорий (снижено с 30%, т.к. белок теперь считается от веса)
  const carbCals = Math.max(0, cals - proteinCals - fatCals);

  return {
    bmr: Math.round(bmr),
    maintenanceCalories,
    dailyCalorieNorm: cals,
    macros: {
      protein: proteinG,
      fat: Math.round(fatCals / 9),
      carb: Math.round(carbCals / 4),
    },
  };
}
