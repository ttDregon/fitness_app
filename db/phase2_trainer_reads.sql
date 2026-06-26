-- ============================================================
-- Фаза 2 (профиль клиента): тренер читает weight_log клиентов своих групп.
-- Нужно, чтобы в профиле клиента у тренера считался прогресс по весу
-- (старт = самая ранняя запись weight_log).
-- Запусти в Supabase → SQL Editor → Run. Безопасно перезапускать.
--
-- ВАЖНО: здесь намеренно НЕТ `alter table ... enable row level security`.
-- Если RLS на weight_log уже включён — политика просто добавит доступ тренеру.
-- Если RLS выключен — таблица и так читается, политика «спит», ничего не ломается.
-- water_log тренер уже читает (политика из phase0_meals_water.sql).
-- ============================================================

drop policy if exists weight_log_trainer_read on public.weight_log;
create policy weight_log_trainer_read on public.weight_log
  for select using (
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.user_id = weight_log.user_id and g.owner_id = auth.uid()
    )
  );
