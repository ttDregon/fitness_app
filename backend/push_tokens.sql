-- Таблица push-токенов устройств. Запусти в Supabase → SQL Editor.
-- Одна строка на устройство (PK = token), несколько устройств на пользователя — ок.

create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text,
  updated_at  timestamptz default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

-- Пользователь управляет своими токенами (upsert/select с фронта под своей сессией).
drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ВАЖНО: бэкенд (/notify) читает токены ДРУГИХ пользователей (тренер -> клиент).
-- Это работает, только если SUPABASE_KEY на бэкенде — service_role ключ (он обходит RLS).
-- Если на бэкенде используется anon-ключ, раскомментируй политику ниже
-- (она открывает чтение токенов всем аутентифицированным — менее безопасно):
--
-- create policy "read tokens for sending" on public.push_tokens
--   for select using (auth.role() = 'authenticated');
