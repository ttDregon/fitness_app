-- ============================================================
-- Фаза 4: приёмы пищи делятся по типу (завтрак/обед/ужин/перекус)
-- и хранят разбивку по продуктам.
-- Запусти в Supabase → SQL Editor → Run. Безопасно перезапускать.
--
-- assigned_meals.meal_data — jsonb, миграции не требует (формат гибкий):
--   [{ id, meal_type, name, items:[{name,calories,protein,fat,carbs}], calories, protein, fat, carbs, eaten }]
-- meal_log — добавляем два столбца под тот же формат самозаписи клиента.
-- ============================================================

alter table public.meal_log add column if not exists meal_type text;
alter table public.meal_log add column if not exists items jsonb;
