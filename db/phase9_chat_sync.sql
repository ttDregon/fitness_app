-- История ИИ-чата в облаке: раньше диалоги жили только в памяти телефона (AsyncStorage),
-- и на новом устройстве / после переустановки история была пустой.
-- Запусти в Supabase → SQL Editor ДО обновления приложения. Скрипт идемпотентный.
-- Пока таблицы нет, приложение работает как раньше (только локальная история).

create table if not exists public.chat_sessions (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  id         text    not null,                      -- id диалога из приложения
  title      text    not null default '',
  messages   jsonb   not null default '[]'::jsonb,  -- ChatMessage[] (см. frontend/src/types.ts)
  updated_at bigint  not null,                      -- мс, как ChatSession.updatedAt: побеждает более свежая копия
  deleted    boolean not null default false,        -- «надгробие»: удалённый на одном телефоне диалог не воскресает с другого
  primary key (user_id, id)
);

alter table public.chat_sessions enable row level security;

-- Каждый видит и пишет только свои диалоги. Тренер чужие переписки не видит.
drop policy if exists "chat_sessions_own" on public.chat_sessions;
create policy "chat_sessions_own" on public.chat_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Защита от раздувания: один диалог — не больше ~1 МБ.
alter table public.chat_sessions drop constraint if exists chat_sessions_size;
alter table public.chat_sessions add constraint chat_sessions_size
  check (pg_column_size(messages) < 1048576);
