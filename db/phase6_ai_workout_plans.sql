-- ============================================================
-- Фаза 6: ИИ-планы тренировок с чек-листом «план vs факт».
-- Запусти это целиком в Supabase → SQL Editor → Run.
-- Безопасно перезапускать: используются IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- Черновик плана, сгенерированного ИИ под группу мышц. Живёт отдельно от
-- личного журнала (public.workouts) пока пользователь отмечает факт по сетам;
-- при нажатии «Добавить» на клиенте данные коммитятся в workouts, а строка
-- отсюда удаляется (см. commitAiWorkoutPlan во frontend/src/context/AppContext.tsx).
create table if not exists public.ai_workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date text not null,                       -- 'YYYY-MM-DD', день создания черновика
  muscle_group text not null,
  plan_name text,
  preferences text,
  plan_data jsonb not null default '[]',    -- [{id, exercise, sets:[{id,target_reps,target_weight,actual_reps,actual_weight,completed}]}]
  created_at timestamptz default now()
);
create index if not exists ai_workout_plans_user_date_idx on public.ai_workout_plans (user_id, date);
create index if not exists ai_workout_plans_user_group_idx on public.ai_workout_plans (user_id, muscle_group, created_at desc);

alter table public.ai_usage add column if not exists plan int not null default 0;

alter table public.ai_workout_plans enable row level security;
drop policy if exists ai_workout_plans_owner on public.ai_workout_plans;
create policy ai_workout_plans_owner on public.ai_workout_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
