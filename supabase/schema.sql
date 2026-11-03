-- CWU App: preferências por usuário (rode no SQL Editor do Supabase)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suggested_apps text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- Cada usuário só enxerga e altera a própria linha
create policy "ler as próprias preferências" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "criar as próprias preferências" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "alterar as próprias preferências" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
