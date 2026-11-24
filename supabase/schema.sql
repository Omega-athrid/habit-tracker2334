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

-- ═════════════════════════════════════════════════════════════════════════
-- v2 — Metas, pendientes y coach con IA
-- Es seguro volver a correr todo el archivo: nada se borra ni se duplica.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  why         text not null default '' check (char_length(why) <= 500),
  area        text not null default 'otro' check (area in ('cuerpo', 'cara', 'mente', 'plata', 'trabajo', 'otro')),
  target_date date default null,
  status      text not null default 'active' check (status in ('active', 'done')),
  created_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id     uuid default null references public.goals (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  due_date    date default null,
  done        boolean not null default false,
  done_at     timestamptz default null,
  created_at  timestamptz not null default now()
);

-- Un hábito puede colgar de una meta
alter table public.habits add column if not exists goal_id uuid default null references public.goals (id) on delete set null;

-- Lo que el coach sabe de vos (lo escribís en Ajustes)
create table if not exists public.profiles (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 40),
  about       text not null default '' check (char_length(about) <= 1500),
  updated_at  timestamptz not null default now()
);

create table if not exists public.coach_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create table if not exists public.analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notes       text not null default '',
  result      jsonb not null,
  photo_paths text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists tasks_user_idx on public.tasks (user_id);
create index if not exists coach_messages_user_idx on public.coach_messages (user_id, created_at);
create index if not exists analyses_user_idx on public.analyses (user_id, created_at);

alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.profiles enable row level security;
alter table public.coach_messages enable row level security;
alter table public.analyses enable row level security;

drop policy if exists "goals_own" on public.goals;
create policy "goals_own" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "coach_messages_own" on public.coach_messages;
create policy "coach_messages_own" on public.coach_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "analyses_own" on public.analyses;
create policy "analyses_own" on public.analyses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fotos: bucket PRIVADO. Cada usuario solo lee/escribe dentro de su carpeta "<user_id>/…"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "photos_select_own" on storage.objects;
create policy "photos_select_own" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos_insert_own" on storage.objects;
create policy "photos_insert_own" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
