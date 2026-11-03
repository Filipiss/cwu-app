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

-- Limites contra abuso: a chave publishable é pública, então alguém poderia chamar a API
-- direto (sem o app) tentando gravar listas gigantes. O banco recusa:
alter table public.user_preferences
  drop constraint if exists suggested_apps_limits;
alter table public.user_preferences
  add constraint suggested_apps_limits check (
    cardinality(suggested_apps) <= 200
    and pg_column_size(suggested_apps) <= 8192
  );

-- Nenhuma outra função ou tabela fica exposta: só o dono altera a própria linha (RLS acima),
-- e ninguém pode apagar linhas pela API (não há política de DELETE).
