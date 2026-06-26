-- ============================================================
-- Календарь записей: клиент должен видеть свои тренировки (training_sessions),
-- а не только тренер. Добавляем недостающую политику чтения для клиента.
-- Запусти в Supabase → SQL Editor → Run. Безопасно перезапускать.
--
-- Намеренно без `enable row level security`: политики только РАСШИРЯЮТ доступ
-- (несколько permissive-политик объединяются по ИЛИ), ничего не ограничивая.
-- ============================================================

-- Клиент читает свои записи.
drop policy if exists training_sessions_client_read on public.training_sessions;
create policy training_sessions_client_read on public.training_sessions
  for select using (client_id = auth.uid());

-- Тренер: полный доступ к своим записям (создание/чтение/удаление).
drop policy if exists training_sessions_trainer_all on public.training_sessions;
create policy training_sessions_trainer_all on public.training_sessions
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
