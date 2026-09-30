-- ============================================================
-- Клиент отмечает подходы назначенной тренировки как выполненные.
-- Запусти целиком в Supabase → SQL Editor → Run. Безопасно перезапускать.
--
-- toggleExerciseStatus (frontend/src/context/AppContext.tsx) делает UPDATE
-- assigned_workouts от имени клиента, а security_rls.sql дал клиенту только SELECT.
-- RLS при этом не выдаёт ошибку — UPDATE просто затрагивает 0 строк: галочка
-- видна до перезахода, в базу не попадает, и тренер видит «Прогресс: 0%».
-- ============================================================

drop policy if exists assigned_workouts_client_update on public.assigned_workouts;
create policy assigned_workouts_client_update on public.assigned_workouts
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
