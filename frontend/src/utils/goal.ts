// Прогресс к целевому весу, % (0–100). Учитывает направление: при цели «похудеть» набор веса —
// это не прогресс, и наоборот. Раньше считалось через Math.abs(старт − сейчас), и +2 кг при
// цели −5 кг показывали «пройдено 40%».
export const goalProgressPct = (start: number, current: number, target: number): number => {
  const total = target - start;
  if (total === 0) return current === target ? 100 : 0;
  const pct = Math.round(((current - start) / total) * 100);
  return Math.max(0, Math.min(100, pct));
};
