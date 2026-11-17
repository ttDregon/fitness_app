-- Striva Премиум (подписка Google Play). Запусти в Supabase → SQL Editor ДО деплоя бэкенда.
-- Скрипт идемпотентный: повторный запуск ничего не ломает.

-- 1) Статус Премиума на профиле. Пишет ТОЛЬКО бэкенд (service_role) после проверки покупки
--    у Google; приложение читает.
alter table public.profiles add column if not exists premium_until  timestamptz; -- доступ до этой даты
alter table public.profiles add column if not exists premium_plan   text;        -- monthly | quarterly | yearly
alter table public.profiles add column if not exists premium_source text;        -- google_play | manual

-- 2) Защита: пользователь может обновлять свой профиль (вес, цель...) — RLS это разрешает.
--    Без триггера ниже он мог бы из приложения выставить себе premium_until = 2099 год.
--    Из-под ролей приложения (anon/authenticated) поля премиума не меняются; бэкенд
--    (service_role) и SQL Editor (postgres) — меняют.
create or replace function public.protect_premium_fields() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.premium_until := null;
      new.premium_plan := null;
      new.premium_source := null;
    else
      new.premium_until := old.premium_until;
      new.premium_plan := old.premium_plan;
      new.premium_source := old.premium_source;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_premium_fields on public.profiles;
create trigger protect_premium_fields
  before insert or update on public.profiles
  for each row execute function public.protect_premium_fields();

-- 3) Покупки Google Play. Один purchase_token принадлежит одному аккаунту Striva — так
--    одну оплату нельзя «раздать» на несколько аккаунтов. Доступ только у service_role.
create table if not exists public.billing_purchases (
  purchase_token  text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  product_id      text not null,
  base_plan_id    text,
  state           text,            -- SUBSCRIPTION_STATE_* из Google Play Developer API
  expiry_time     timestamptz,
  auto_renewing   boolean,
  latest_order_id text,            -- GPA.xxxx — номер заказа в Play Console (для поддержки)
  test_purchase   boolean not null default false,
  checked_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists billing_purchases_user_idx on public.billing_purchases(user_id);
alter table public.billing_purchases enable row level security;
-- Политик нет намеренно: из приложения таблица не видна и не пишется.

-- Выдать Премиум вручную (тест, подарок, компенсация) — в SQL Editor:
--   update public.profiles
--      set premium_until = now() + interval '1 month', premium_plan = 'monthly', premium_source = 'manual'
--    where id = '<uuid пользователя>';
