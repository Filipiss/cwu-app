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

-- ===== Assistente (chatbot): limite diário de mensagens por usuário =====
create table if not exists public.chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.chat_usage enable row level security;
-- O usuário pode ver o próprio uso; só a Edge Function (service role) grava
drop policy if exists "ler o próprio uso do chat" on public.chat_usage;
create policy "ler o próprio uso do chat" on public.chat_usage
  for select using (auth.uid() = user_id);

-- Soma 1 ao uso do dia (horário de Brasília) e devolve quantas mensagens restam.
-- Devolve -1 quando o limite já foi atingido. Atômico: duas chamadas simultâneas não furam o limite.
create or replace function public.cwu_chat_consume(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count int;
begin
  insert into public.chat_usage (user_id, day, count) values (p_user, v_day, 1)
  on conflict (user_id, day) do update set count = public.chat_usage.count + 1
    where public.chat_usage.count < p_limit
  returning count into v_count;
  if v_count is null then return -1; end if;
  return p_limit - v_count;
end;
$$;
-- Ninguém chama pela API pública: só o servidor (service role) dentro da Edge Function
revoke all on function public.cwu_chat_consume(uuid, int) from public, anon, authenticated;
grant execute on function public.cwu_chat_consume(uuid, int) to service_role;
