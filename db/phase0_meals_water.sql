-- ============================================================
-- Фаза 0: схема для питания (план + лог) и воды
-- Запусти это целиком в Supabase → SQL Editor → Run.
-- Безопасно перезапускать: используются IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- 1) Питание, назначенное тренером. Одна строка = один день (зеркало assigned_workouts).
create table if not exists public.assigned_meals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  client_id uuid not null,
  trainer_id uuid not null,
  date text not null,                      -- 'YYYY-MM-DD'
  meal_data jsonb not null default '[]',   -- [{id,name,calories,protein,fat,carbs,eaten}]
  created_at timestamptz default now(),
  unique (client_id, date)
);

-- 2) Реально съеденное клиентом: и отметки из плана, и самозапись. Чтобы видел тренер и считались итоги.
create table if not exists public.meal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date text not null,                      -- 'YYYY-MM-DD'
  name text,
  calories int default 0,
  protein  int default 0,
  fat      int default 0,
  carbs    int default 0,
  source text default 'self',              -- 'self' | 'assigned'
  created_at timestamptz default now()
);
create index if not exists meal_log_user_date_idx on public.meal_log (user_id, date);

-- 3) Вода по дням.
create table if not exists public.water_log (
  user_id uuid not null,
  date text not null,                      -- 'YYYY-MM-DD'
  liters real default 0,
  primary key (user_id, date)
);

-- ------------------------------------------------------------
-- RLS. Модель: groups.owner_id = тренер; group_members связывает клиента с группой.
-- Если у тебя для assigned_workouts политики написаны иначе — ориентируйся на них,
-- здесь дан рабочий вариант по auth.uid().
-- ------------------------------------------------------------
alter table public.assigned_meals enable row level security;
alter table public.meal_log       enable row level security;
alter table public.water_log      enable row level security;

-- assigned_meals: клиент видит/обновляет своё (ставит eaten); тренер — то, что назначил он.
drop policy if exists assigned_meals_client on public.assigned_meals;
create policy assigned_meals_client on public.assigned_meals
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists assigned_meals_trainer on public.assigned_meals;
create policy assigned_meals_trainer on public.assigned_meals
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- meal_log: владелец делает всё со своими строками.
drop policy if exists meal_log_owner on public.meal_log;
create policy meal_log_owner on public.meal_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- meal_log: тренер читает строки клиентов из своих групп.
drop policy if exists meal_log_trainer_read on public.meal_log;
create policy meal_log_trainer_read on public.meal_log
  for select using (
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.user_id = meal_log.user_id and g.owner_id = auth.uid()
    )
  );

-- water_log: владелец — всё своё; тренер — чтение клиентов своих групп.
drop policy if exists water_log_owner on public.water_log;
create policy water_log_owner on public.water_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists water_log_trainer_read on public.water_log;
create policy water_log_trainer_read on public.water_log
  for select using (
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.user_id = water_log.user_id and g.owner_id = auth.uid()
    )
  );
