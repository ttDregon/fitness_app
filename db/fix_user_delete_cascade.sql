-- Удаление пользователя из Supabase Auth падало с
--   violates foreign key constraint "..._fkey"
-- потому что внешние ключи на auth.users созданы без ON DELETE CASCADE
-- (profiles, weight_log и, возможно, другие таблицы).
--
-- Этот скрипт находит ВСЕ FK в схеме public, ссылающиеся на auth.users,
-- и пересоздаёт их с ON DELETE CASCADE. После этого удаление аккаунта
-- автоматически удаляет все его строки в этих таблицах.
-- Запусти в Supabase → SQL Editor → Run. Безопасно перезапускать
-- (уже каскадные ключи пропускаются).

do $$
declare
  r record;
  cols text;
begin
  for r in
    select c.conname, c.conrelid, c.conrelid::regclass::text as tbl, c.conkey
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and rel.relnamespace = 'public'::regnamespace
      and c.confdeltype <> 'c'   -- ещё не CASCADE
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into cols
    from unnest(r.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;

    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%s) references auth.users(id) on delete cascade',
      r.tbl, r.conname, cols
    );
    raise notice 'CASCADE добавлен: % на % (%)', r.conname, r.tbl, cols;
  end loop;
end $$;
