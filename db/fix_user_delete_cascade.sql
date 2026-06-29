-- Удаление пользователя из Supabase Auth падало с
--   violates foreign key constraint "profiles_id_fkey"
-- потому что profiles.id -> auth.users(id) создан без ON DELETE CASCADE.
-- Пересоздаём FK с каскадом: при удалении аккаунта его профиль удалится автоматически.
-- Запусти в Supabase → SQL Editor → Run. Безопасно перезапускать.

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;
