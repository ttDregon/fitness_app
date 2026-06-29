-- ============================================================
-- ЗАКРЫТИЕ RLS. Включает RLS на всех таблицах и даёт точные политики под то,
-- как приложение реально читает/пишет данные. Идемпотентно (drop if exists),
-- безопасно перезапускать.
--
-- ВАЖНО про порядок выкладки: этот скрипт + OTA приложения (новый joinGroup
-- через RPC) нужно применять ВМЕСТЕ — пока не обновлённое приложение не сможет
-- вступать в клуб по коду (groups закрыт, вступление теперь через функцию).
-- Все остальные функции продолжают работать сразу.
--
-- После запуска ПРОВЕРЬ: вход/регистрация, изменение веса, журнал тренировок,
-- вода/еда, у тренера — список клиентов и их прогресс, назначение трен/меню,
-- у клиента — вступление в клуб по коду и просмотр назначенного.
-- ============================================================

-- ---------- helper-функции (SECURITY DEFINER: внутри обходят RLS) ----------
-- Нужны, чтобы политики groups/group_members не зациклились друг на друге.

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups where id = gid and owner_id = auth.uid());
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

-- client состоит в группе, которой владеет текущий пользователь (тренер)?
create or replace function public.shares_owned_group(client uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from group_members gm
    join groups g on g.id = gm.group_id
    where gm.user_id = client and g.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_group_owner(uuid)   from public;
revoke all on function public.is_group_member(uuid)   from public;
revoke all on function public.shares_owned_group(uuid) from public;
grant execute on function public.is_group_owner(uuid)   to authenticated;
grant execute on function public.is_group_member(uuid)   to authenticated;
grant execute on function public.shares_owned_group(uuid) to authenticated;

-- ---------- profiles ----------
alter table public.profiles enable row level security;
-- (оставляем существующие "Users can insert own profile" / "Users can view own profile")
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = id);
-- тренер читает профили своих клиентов (имя/почта в списке клиентов)
drop policy if exists profiles_trainer_read on public.profiles;
create policy profiles_trainer_read on public.profiles
  for select using (public.shares_owned_group(id));

-- ---------- weight_log ----------
alter table public.weight_log enable row level security;
drop policy if exists weight_log_owner on public.weight_log;
create policy weight_log_owner on public.weight_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists weight_log_trainer_read on public.weight_log;
create policy weight_log_trainer_read on public.weight_log
  for select using (public.shares_owned_group(user_id));

-- ---------- workouts (личный журнал тренировок) ----------
alter table public.workouts enable row level security;
drop policy if exists workouts_owner on public.workouts;
create policy workouts_owner on public.workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- groups ----------
alter table public.groups enable row level security;
drop policy if exists groups_owner on public.groups;
create policy groups_owner on public.groups
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists groups_member_read on public.groups;
create policy groups_member_read on public.groups
  for select using (public.is_group_member(id));

-- ---------- group_members ----------
alter table public.group_members enable row level security;
-- УБИРАЕМ опасную политику «всё можно всем авторизованным»
drop policy if exists "Allow all for authenticated" on public.group_members;
drop policy if exists group_members_own on public.group_members;
create policy group_members_own on public.group_members
  for select using (user_id = auth.uid());                 -- клиент видит своё участие
drop policy if exists group_members_owner on public.group_members;
create policy group_members_owner on public.group_members  -- тренер управляет участниками своих групп
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));
drop policy if exists group_members_leave on public.group_members;
create policy group_members_leave on public.group_members
  for delete using (user_id = auth.uid());                 -- клиент может выйти
-- INSERT для клиента (вступление) идёт через RPC join_group_by_code (см. ниже),
-- она SECURITY DEFINER и обходит RLS — отдельная клиентская INSERT-политика не нужна.

-- ---------- assigned_workouts ----------
alter table public.assigned_workouts enable row level security;
drop policy if exists assigned_workouts_client on public.assigned_workouts;
create policy assigned_workouts_client on public.assigned_workouts
  for select using (client_id = auth.uid());
drop policy if exists assigned_workouts_trainer on public.assigned_workouts;
create policy assigned_workouts_trainer on public.assigned_workouts
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ---------- assigned_meals (RLS уже был; гарантируем включение) ----------
alter table public.assigned_meals enable row level security;

-- ---------- meal_log / water_log: пере-объявляем trainer-read через helper ----------
alter table public.meal_log enable row level security;
drop policy if exists meal_log_trainer_read on public.meal_log;
create policy meal_log_trainer_read on public.meal_log
  for select using (public.shares_owned_group(user_id));

alter table public.water_log enable row level security;
drop policy if exists water_log_trainer_read on public.water_log;
create policy water_log_trainer_read on public.water_log
  for select using (public.shares_owned_group(user_id));

-- ---------- training_sessions: phase5 НЕ включал RLS — включаем ----------
alter table public.training_sessions enable row level security;

-- ---------- остальные: гарантируем, что RLS включён ----------
alter table public.push_tokens enable row level security;
alter table public.ai_usage    enable row level security;

-- ============================================================
-- RPC вступления в клуб по коду. groups закрыт на чтение, поэтому поиск по коду
-- и вступление делаем здесь (security definer обходит RLS). Возвращает группу.
-- ============================================================
create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from groups where code = p_code limit 1;
  if g.id is null then
    raise exception 'group_not_found';
  end if;
  if not exists (select 1 from group_members where group_id = g.id and user_id = auth.uid()) then
    insert into group_members (group_id, user_id) values (g.id, auth.uid());
  end if;
  return g;
end;
$$;

revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;
