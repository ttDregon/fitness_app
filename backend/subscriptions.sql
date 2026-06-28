-- Подписки и лимиты ИИ. Запусти в Supabase → SQL Editor.

-- 1) Поля подписок на профиле. Их выставляет Telegram-бот после оплаты (service_role).
alter table public.profiles add column if not exists trainer_until timestamptz; -- доступ к роли тренера до этой даты
alter table public.profiles add column if not exists ai_plan text default 'free'; -- 'free' | 'p50' | 'p150' | 'unlim'
alter table public.profiles add column if not exists ai_until timestamptz;        -- до какой даты действует ai_plan

-- 2) Дневной учёт запросов к ИИ (считается на бэкенде, нельзя обойти из приложения).
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  chat     int not null default 0,
  meal     int not null default 0,
  workout  int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
-- Пользователь видит свой расход; пишет в таблицу только бэкенд (service_role минует RLS).
drop policy if exists "own ai usage" on public.ai_usage;
create policy "own ai usage" on public.ai_usage for select using (auth.uid() = user_id);

-- ВАЖНО: и бэкенд (лимиты), и Telegram-бот (выставление подписки) должны ходить в Supabase
-- под SERVICE_ROLE ключом — он обходит RLS. На бэкенде Render это уже так (SUPABASE_KEY=service_role).
