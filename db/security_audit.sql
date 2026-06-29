-- ============================================================
-- ДИАГНОСТИКА БЕЗОПАСНОСТИ (только чтение, ничего не меняет).
-- Запусти в Supabase → SQL Editor → Run и пришли мне результат обоих запросов.
-- По нему составим точный скрипт включения RLS, не ломая работающие функции.
-- ============================================================

-- 1) Где RLS ВКЛЮЧЁН, а где НЕТ. Любая строка с rls_enabled=false и есть дыра:
--    такую таблицу можно читать/писать публичным anon-ключом (он зашит в приложении).
select c.relname            as table_name,
       c.relrowsecurity     as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- 2) Какие политики есть на каждой таблице (если RLS включён, но политик нет —
--    таблица закрыта полностью; если политики есть — смотрим, что они разрешают).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
