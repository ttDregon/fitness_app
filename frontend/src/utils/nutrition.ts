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

const ACTIVITY_MULT: Record<string, number> = { '1-2': 1.375, '3-4': 1.55, '5+': 1.725 };

// Белок, г/кг веса тела, по цели — в пределах безопасного диапазона 1.6–2.2 г/кг.
const PROTEIN_G_PER_KG: Record<string, number> = { lose: 2.0, gain: 1.9, maintain: 1.6 };

export function computeNutritionTargets(p: NutritionInputs): NutritionTargets {
  const bmr = p.gender === 'male'
    ? (10 * p.weight) + (6.25 * p.height) - (5 * p.age) + 5
    : (10 * p.weight) + (6.25 * p.height) - (5 * p.age) - 161;

  const mult = ACTIVITY_MULT[p.workoutsPerWeek || ''] || 1.2;
  const maintenanceCalories = Math.round(bmr * mult);

  let cals = maintenanceCalories;
  if (p.goal === 'lose') cals -= 500;
  else if (p.goal === 'gain') cals += 500;
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
