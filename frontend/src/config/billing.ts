// Тарифы и подписки. Деньги принимаются в Telegram-боте (Stars); бот пишет статус
// подписки в Supabase, приложение его читает и открывает доступ.

// Username бота оплаты (без @).
export const TG_BOT = 'Striva_payment_bot';

// Подписка «Тренер» — доступ к роли тренера на период (без автопродления).
export const TRAINER_PLANS = [
  { id: 'm1',  label: '1 месяц',   priceUsd: 2,  months: 1  },
  { id: 'm3',  label: '3 месяца',  priceUsd: 5,  months: 3  },
  { id: 'm6',  label: '6 месяцев', priceUsd: 9,  months: 6  },
  { id: 'm12', label: '1 год',     priceUsd: 16, months: 12 },
] as const;

// Подписка на ИИ-чат — поднимает дневной лимит вопросов.
export const AI_PLANS = [
  { id: 'p50',    label: '50 вопросов/день',  priceUsd: 1, perDay: 50  },
  { id: 'p150',   label: '150 вопросов/день', priceUsd: 3, perDay: 150 },
  { id: 'unlim',  label: 'Безлимит',          priceUsd: 5, perDay: -1  },
] as const;

// Бесплатные дневные лимиты ИИ.
export const AI_FREE_CHAT_PER_DAY = 10;
export const AI_FREE_PARSE_PER_DAY = 10; // разбор еды и тренировок — по 10/день каждый, всегда

export type TrainerPlanId = typeof TRAINER_PLANS[number]['id'];
export type AiPlanId = typeof AI_PLANS[number]['id'];

// Диплинк в бота: бот по start-параметру понимает, кому и что активировать.
export const tgCheckoutUrl = (kind: 'trainer' | 'ai', planId: string, userId?: string) =>
  `https://t.me/${TG_BOT}?start=${kind}-${planId}-${userId || 'anon'}`;
