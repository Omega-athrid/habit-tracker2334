-- ─────────────────────────────────────────────────────────────────────────
-- Hábitos — esquema de base de datos para Supabase
-- Pegalo entero en: Supabase → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  icon_type   text not null default 'emoji' check (icon_type in ('emoji', 'icon')),
  icon        text not null default '✨',
  icon_color  text not null default 'white' check (icon_color in ('white', 'black')),
  color       text not null default '#D97757',
  days        smallint[] default null,          -- null = todos los días; 0 = domingo … 6 = sábado
  start_date  date not null default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists public.completions (
  habit_id    uuid not null references public.habits (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (habit_id, day)
);

create index if not exists habits_user_idx on public.habits (user_id);
create index if not exists completions_user_day_idx on public.completions (user_id, day);

-- Seguridad: cada usuario ve y toca SOLO sus datos
alter table public.habits enable row level security;
alter table public.completions enable row level security;

drop policy if exists "habits_own" on public.habits;
create policy "habits_own" on public.habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "completions_select" on public.completions;
create policy "completions_select" on public.completions
  for select using (user_id = auth.uid());

drop policy if exists "completions_delete" on public.completions;
create policy "completions_delete" on public.completions
  for delete using (user_id = auth.uid());

-- No se pueden marcar días futuros (+1 día de margen por husos horarios)
-- y solo sobre hábitos propios.
drop policy if exists "completions_insert" on public.completions;
create policy "completions_insert" on public.completions
  for insert with check (
    user_id = auth.uid()
    and day <= current_date + 1
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
