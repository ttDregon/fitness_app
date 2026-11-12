export const getCurrentDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// YYYY-MM-DD для произвольной даты (не обязательно сегодня) — группировка истории по дням.
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 'YYYY-MM-DD' → локальная дата (полдень — чтобы переход на летнее время не сдвигал день).
export const parseYmd = (s: string) => new Date(`${s}T12:00:00`);

// Сдвиг строки-даты на n дней (n может быть отрицательным).
export const addDaysStr = (base: string, n: number) => {
  const d = parseYmd(base);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

// Склонение: plural(5, ['день', 'дня', 'дней']) → 'дней'.
export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};
