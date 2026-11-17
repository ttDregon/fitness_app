// Бесплатные дневные лимиты ИИ — для всех, всегда (считаются на сервере, см. backend/main.py).
export const AI_FREE_CHAT_PER_DAY = 30;
export const AI_FREE_PARSE_PER_DAY = 15; // разбор еды и тренировок — по 15/день каждый

// --- Striva Премиум: подписка через Google Play Billing ---
// В Play Console: Монетизация → Подписки → одна подписка с этим id и тремя базовыми
// планами (id планов — ниже). Цены задаются в Play Console и приходят в приложение уже в
// валюте пользователя — в коде их нет.
export const PREMIUM_PRODUCT_ID = 'striva_premium';
export const ANDROID_PACKAGE = 'com.ttdregon.mysafeapp';

export const PREMIUM_PLANS = [
  { id: 'monthly', label: '1 месяц', months: 1 },
  { id: 'quarterly', label: '3 месяца', months: 3 },
  { id: 'yearly', label: '12 месяцев', months: 12 },
] as const;
export type PremiumPlanId = typeof PREMIUM_PLANS[number]['id'];
// План, выбранный на экране по умолчанию (самый выгодный).
export const DEFAULT_PLAN: PremiumPlanId = 'yearly';

// Лимиты ИИ с Премиумом (должны совпадать с AI_PREMIUM_* в backend/main.py).
export const AI_PREMIUM_CHAT_PER_DAY = 200;
export const AI_PREMIUM_PARSE_PER_DAY = 100;

// Что даёт Премиум — список на экране оформления.
export const PREMIUM_FEATURES = [
  { icon: 'chatbubbles', title: `ИИ-компаньон: ${AI_PREMIUM_CHAT_PER_DAY} сообщений в день`, sub: `бесплатно — ${AI_FREE_CHAT_PER_DAY}` },
  { icon: 'sparkles', title: `Разбор еды, тренировок и ИИ-планы: по ${AI_PREMIUM_PARSE_PER_DAY} в день`, sub: `бесплатно — по ${AI_FREE_PARSE_PER_DAY}` },
  { icon: 'people', title: 'Инструменты тренера', sub: 'клубы, назначение тренировок и питания, расписание' },
] as const;

// Страница управления подпиской в Google Play (отмена, смена карты).
export const MANAGE_SUBSCRIPTION_URL =
  `https://play.google.com/store/account/subscriptions?sku=${PREMIUM_PRODUCT_ID}&package=${ANDROID_PACKAGE}`;
export const PLAY_STORE_URL = `market://details?id=${ANDROID_PACKAGE}`;
