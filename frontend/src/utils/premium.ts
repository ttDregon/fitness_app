// Чистая логика Премиума (без React Native) — её проверяет scripts/logic-test.js.
// Превращает подписку из Google Play (expo-iap) в карточки тарифов: цена, цена за месяц,
// скидка относительно помесячной оплаты, пробный период.

export interface PlanConfig { id: string; label: string; months: number }

// Минимум полей из expo-iap (SubscriptionOffer / PricingPhaseAndroid), которые нам нужны.
export interface StorePricingPhase {
  billingPeriod: string;        // ISO-8601: P1M, P3M, P1Y, P7D...
  formattedPrice: string;
  priceAmountMicros: string | number;
  priceCurrencyCode: string;
  recurrenceMode?: number;      // 1 — бесконечно (обычная цена), 2 — N циклов, 3 — однократно
  billingCycleCount?: number;
}
export interface StoreOffer {
  basePlanIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
  pricingPhasesAndroid?: { pricingPhaseList: StorePricingPhase[] } | null;
}

export interface PlanOffer {
  planId: string;
  label: string;
  months: number;
  offerToken: string;
  price: string;            // обычная цена за период, как её показывает Google Play
  priceMicros: number;
  currency: string;
  perMonth: string | null;  // ≈ цена за месяц (для планов длиннее месяца)
  savingsPct: number;       // скидка против помесячной оплаты, %
  trialDays: number;        // бесплатный пробный период (если есть и пользователь может его взять)
}

export type MoneyFormatter = (micros: number, currency: string) => string;

export const defaultMoneyFormat: MoneyFormatter = (micros, currency) => {
  const value = micros / 1e6;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency, maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

/** Длительность ISO-периода в днях (P1M ≈ 30, P1Y ≈ 365) — для пробного периода. */
export function periodDays(iso: string): number {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso || '');
  if (!m) return 0;
  const [, y, mo, w, d] = m.map(x => (x ? parseInt(x, 10) : 0)) as number[];
  return y * 365 + mo * 30 + w * 7 + d;
}

const micros = (p: StorePricingPhase) => Number(p.priceAmountMicros) || 0;

// Обычная (регулярная) цена — последняя фаза с бесконечным повтором; если не размечено — последняя.
const regularPhase = (phases: StorePricingPhase[]) =>
  [...phases].reverse().find(p => p.recurrenceMode === 1) || phases[phases.length - 1];

const trialDaysOf = (phases: StorePricingPhase[]) =>
  phases.filter(p => micros(p) === 0).reduce((s, p) => s + periodDays(p.billingPeriod) * Math.max(p.billingCycleCount || 1, 1), 0);

/**
 * Тарифы для экрана оформления — в порядке PLANS. Базовый план, которого нет в Google Play
 * (ещё не создан / не активен), просто не показывается.
 */
export function buildPlanOffers(
  offers: StoreOffer[] | null | undefined,
  plans: readonly PlanConfig[],
  format: MoneyFormatter = defaultMoneyFormat,
): PlanOffer[] {
  const list = (offers || []).filter(o => o?.offerTokenAndroid && o.pricingPhasesAndroid?.pricingPhaseList?.length);
  const picked: PlanOffer[] = [];
  for (const plan of plans) {
    const candidates = list.filter(o => o.basePlanIdAndroid === plan.id);
    if (!candidates.length) continue;
    // Если Google предлагает пользователю пробный период — берём это предложение, иначе базовое.
    const best = [...candidates].sort((a, b) =>
      trialDaysOf(b.pricingPhasesAndroid!.pricingPhaseList) - trialDaysOf(a.pricingPhasesAndroid!.pricingPhaseList))[0];
    const phases = best.pricingPhasesAndroid!.pricingPhaseList;
    const reg = regularPhase(phases);
    picked.push({
      planId: plan.id, label: plan.label, months: plan.months,
      offerToken: best.offerTokenAndroid!,
      price: reg.formattedPrice, priceMicros: micros(reg), currency: reg.priceCurrencyCode,
      perMonth: null, savingsPct: 0, trialDays: trialDaysOf(phases),
    });
  }
  const monthly = picked.find(p => p.months === 1);
  for (const p of picked) {
    if (p.months <= 1 || p.priceMicros <= 0) continue;
    p.perMonth = format(p.priceMicros / p.months, p.currency);
    if (monthly && monthly.currency === p.currency && monthly.priceMicros > 0) {
      const full = monthly.priceMicros * p.months;
      const pct = Math.round((1 - p.priceMicros / full) * 100);
      p.savingsPct = pct >= 5 ? pct : 0;
    }
  }
  return picked;
}

export function isPremiumActive(untilIso: string | null | undefined, now = Date.now()): boolean {
  if (!untilIso) return false;
  const t = new Date(untilIso).getTime();
  return Number.isFinite(t) && t > now;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** «15 декабря 2026» */
export function formatPremiumDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}
