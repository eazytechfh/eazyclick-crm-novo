-- Aba de Conversas (WhatsApp via UAZAPI): mensagens ficam no proprio Postgres do CRM (nao
-- lidas ao vivo da UAZAPI a cada request) e o casamento telefone->lead e resolvido uma unica
-- vez na escrita, via coluna normalizada indexada em BASE_DE_LEADS.
--
-- Esta migration consolida o que no projeto de origem (AUTOJANSCAR) eram 5 migrations
-- separadas (0025_conversas_uazapi, 0027_isolar_conversas_e_assinatura,
-- 0029_leitura_conversa_monotona, 0030_conversas_escalaveis, 0031_uazapi_webhook_dedupe),
-- ja aplicando aqui, de uma vez, os fixes finais (marcar_conversa_lida monotonico, policies
-- otimizadas com "select" para nao reexecutar get_my_cargo()/get_my_nome() por linha,
-- isolamento por vendedor e dedupe do webhook).
--
-- Reaproveita public.get_my_cargo() / public.get_my_nome() (ja existentes desde 0001/0005) e
-- as tabelas ja existentes public."BASE_DE_LEADS", public."VENDEDORES" e public.profiles —
-- nenhuma delas e recriada aqui, apenas alteradas com ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

create extension if not exists pg_trgm;

-- =========================================================================
-- app_settings: colunas novas (tabela ja existe, ver migration 0001)
-- =========================================================================
alter table public.app_settings
  add column if not exists uazapi_webhook_secret text;

alter table public.app_settings
  add column if not exists uazapi_webhook_last_url text;

-- =========================================================================
-- profiles: preferencia individual de assinatura de mensagens (tabela ja existe)
-- =========================================================================
alter table public.profiles
  add column if not exists assinatura_mensagens_ativa boolean not null default true;

-- =========================================================================
-- normalizacao de telefone (forma canonica indexavel: DDD + 8 digitos, sem 55 e sem o 9 extra)
-- =========================================================================
create or replace function public.normalizar_telefone(p_telefone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if v_digits = '' then
    return null;
  end if;
  if length(v_digits) in (12, 13) and left(v_digits, 2) = '55' then
    v_digits := substring(v_digits from 3);
  end if;
  if length(v_digits) = 11 then
    v_digits := substring(v_digits from 1 for 2) || substring(v_digits from 4);
  end if;
  return v_digits;
end;
$$;

alter table public."BASE_DE_LEADS"
  add column if not exists telefone_normalizado text
  generated always as (public.normalizar_telefone(telefone)) stored;

create index if not exists idx_base_de_leads_telefone_normalizado
  on public."BASE_DE_LEADS" (telefone_normalizado);
create index if not exists idx_base_de_leads_vendedor_estagio
  on public."BASE_DE_LEADS" (vendedor, estagio_lead, id);
create index if not exists idx_base_de_leads_nome_trgm
  on public."BASE_DE_LEADS" using gin (nome_lead gin_trgm_ops);
create index if not exists idx_base_de_leads_telefone_trgm
  on public."BASE_DE_LEADS" using gin (telefone gin_trgm_ops);

-- =========================================================================
-- conversas_mensagens (log append-only)
-- =========================================================================
create table if not exists public.conversas_mensagens (
  id bigserial primary key,
  lead_id bigint references public."BASE_DE_LEADS"(id) on delete set null,
  telefone_normalizado text not null,
  chat_jid text not null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  conteudo text,
  tipo text not null default 'text' check (tipo in ('text', 'image', 'audio', 'video', 'document', 'sticker')),
  anexo jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou')),
  provider_message_id text,
  provider_content_hash text,
  client_message_id uuid,
  enviado_por_id uuid references auth.users(id),
  enviado_por_nome text,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversas_mensagens_provider_message_id_key unique (provider_message_id),
  constraint conversas_mensagens_client_message_id_key unique (client_message_id)
);

create index if not exists idx_conversas_mensagens_lead_created
  on public.conversas_mensagens (lead_id, created_at desc);
create index if not exists idx_conversas_mensagens_telefone_created
  on public.conversas_mensagens (telefone_normalizado, created_at desc);
create index if not exists idx_conversas_mensagens_cursor
  on public.conversas_mensagens (telefone_normalizado, created_at desc, id desc);
create index if not exists idx_conversas_mensagens_provider_content_pending
  on public.conversas_mensagens (telefone_normalizado, provider_content_hash, created_at)
  where direcao = 'saida' and provider_message_id is null and provider_content_hash is not null;

create or replace function public.conversas_mensagens_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_conversas_mensagens_updated_at on public.conversas_mensagens;
create trigger trg_conversas_mensagens_updated_at
  before update on public.conversas_mensagens
  for each row execute function public.conversas_mensagens_set_updated_at();

-- =========================================================================
-- conversas_resumo (1 linha por numero de telefone com conversa ativa — a lista/sidebar
-- consulta so esta tabela, nunca conversas_mensagens inteira). Chave por telefone (nao por
-- lead_id) para tambem cobrir contatos do WhatsApp ainda sem lead cadastrado no CRM.
-- =========================================================================
create table if not exists public.conversas_resumo (
  telefone_normalizado text primary key,
  chat_jid text not null,
  lead_id bigint references public."BASE_DE_LEADS"(id) on delete set null,
  ultima_mensagem_id bigint references public.conversas_mensagens(id),
  ultima_mensagem_preview text,
  ultima_mensagem_tipo text,
  ultima_mensagem_em timestamptz,
  total_mensagens integer not null default 0
);

create index if not exists idx_conversas_resumo_ultima_mensagem_em
  on public.conversas_resumo (ultima_mensagem_em desc);
create unique index if not exists idx_conversas_resumo_lead_id
  on public.conversas_resumo (lead_id) where lead_id is not null;
create index if not exists idx_conversas_resumo_cursor
  on public.conversas_resumo (ultima_mensagem_em desc nulls last, telefone_normalizado);
create index if not exists idx_conversas_resumo_sem_lead_cursor
  on public.conversas_resumo (ultima_mensagem_em desc nulls last, telefone_normalizado)
  where lead_id is null;

create or replace function public.atualizar_resumo_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversas_resumo (
    telefone_normalizado, chat_jid, lead_id, ultima_mensagem_id,
    ultima_mensagem_preview, ultima_mensagem_tipo, ultima_mensagem_em, total_mensagens
  )
  values (
    new.telefone_normalizado, new.chat_jid, new.lead_id, new.id,
    left(coalesce(new.conteudo, ''), 300), new.tipo, new.created_at, 1
  )
  on conflict (telefone_normalizado) do update set
    chat_jid = excluded.chat_jid,
    lead_id = coalesce(excluded.lead_id, conversas_resumo.lead_id),
    total_mensagens = conversas_resumo.total_mensagens + 1,
    ultima_mensagem_id = case when excluded.ultima_mensagem_em >= conversas_resumo.ultima_mensagem_em
      then excluded.ultima_mensagem_id else conversas_resumo.ultima_mensagem_id end,
    ultima_mensagem_preview = case when excluded.ultima_mensagem_em >= conversas_resumo.ultima_mensagem_em
      then excluded.ultima_mensagem_preview else conversas_resumo.ultima_mensagem_preview end,
    ultima_mensagem_tipo = case when excluded.ultima_mensagem_em >= conversas_resumo.ultima_mensagem_em
      then excluded.ultima_mensagem_tipo else conversas_resumo.ultima_mensagem_tipo end,
    ultima_mensagem_em = greatest(excluded.ultima_mensagem_em, conversas_resumo.ultima_mensagem_em);
  return new;
end;
$$;

drop trigger if exists trg_atualizar_resumo_conversa on public.conversas_mensagens;
create trigger trg_atualizar_resumo_conversa
  after insert on public.conversas_mensagens
  for each row execute function public.atualizar_resumo_conversa();

-- Reconcilia mensagens/resumo orfaos (lead_id null) quando um lead e criado ou tem o
-- telefone alterado para um numero que ja tinha conversa em andamento.
create or replace function public.reconciliar_mensagens_orfas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.telefone_normalizado is null then
    return new;
  end if;
  if exists (
    select 1 from public."BASE_DE_LEADS" l
    where l.telefone_normalizado = new.telefone_normalizado and l.id <> new.id
  ) then
    return new; -- telefone ambiguo entre leads: nao associa automaticamente
  end if;

  update public.conversas_mensagens
  set lead_id = new.id
  where telefone_normalizado = new.telefone_normalizado and lead_id is null;

  update public.conversas_resumo
  set lead_id = new.id
  where telefone_normalizado = new.telefone_normalizado and lead_id is null;

  return new;
end;
$$;

drop trigger if exists trg_reconciliar_mensagens_orfas on public."BASE_DE_LEADS";
create trigger trg_reconciliar_mensagens_orfas
  after insert or update of telefone on public."BASE_DE_LEADS"
  for each row execute function public.reconciliar_mensagens_orfas();

-- =========================================================================
-- conversas_leitura (status de lido persistido por usuario, por telefone — conversas sem
-- lead tambem precisam de leitura rastreada, ja que podem ser abertas e respondidas direto).
-- =========================================================================
create table if not exists public.conversas_leitura (
  telefone_normalizado text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ultima_mensagem_lida_id bigint,
  -- snapshot de conversas_resumo.total_mensagens no momento da leitura: permite calcular o
  -- badge de nao lidas com uma subtracao em vez de contar linhas em conversas_mensagens.
  total_mensagens_na_leitura integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (telefone_normalizado, user_id)
);

create index if not exists idx_conversas_leitura_usuario_telefone
  on public.conversas_leitura (user_id, telefone_normalizado);

-- =========================================================================
-- conversas_reconciliacao_envio (liga o retorno assincrono da UAZAPI a uma mensagem de saida
-- ja persistida com hash de conteudo, quando a resposta sincrona do envio falha/demora)
-- =========================================================================
create table if not exists public.conversas_reconciliacao_envio (
  provider_message_id text primary key,
  message_id bigint not null unique references public.conversas_mensagens(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.conversas_mensagens enable row level security;
alter table public.conversas_resumo enable row level security;
alter table public.conversas_leitura enable row level security;
alter table public.conversas_reconciliacao_envio enable row level security;

revoke all on public.conversas_mensagens from authenticated, anon;
revoke all on public.conversas_resumo from authenticated, anon;
revoke all on public.conversas_reconciliacao_envio from public, authenticated, anon;
grant select on public.conversas_mensagens to authenticated;
grant select on public.conversas_resumo to authenticated;
grant select, insert, update on public.conversas_leitura to authenticated;
grant all on public.conversas_reconciliacao_envio to service_role;

-- Isolamento por vendedor: contato sem lead so e visivel para admin_master/admin/gerente
-- (responsaveis por decidir se cadastram o lead); uma vez atribuido a um vendedor, so esse
-- vendedor (ou a gestao) enxerga a conversa. Uso de "(select public.get_my_cargo())" evita
-- reexecutar a function por linha avaliada pelo RLS.
drop policy if exists "conversas_mensagens_select" on public.conversas_mensagens;
create policy "conversas_mensagens_select"
  on public.conversas_mensagens for select
  to authenticated
  using (
    (lead_id is null and (select public.get_my_cargo()) in ('admin_master', 'admin', 'gerente'))
    or exists (
      select 1 from public."BASE_DE_LEADS" l
      where l.id = conversas_mensagens.lead_id
        and ((select public.get_my_cargo()) in ('admin_master', 'admin', 'gerente')
          or l.vendedor = (select public.get_my_nome()))
    )
  );

drop policy if exists "conversas_resumo_select" on public.conversas_resumo;
create policy "conversas_resumo_select"
  on public.conversas_resumo for select
  to authenticated
  using (
    (lead_id is null and (select public.get_my_cargo()) in ('admin_master', 'admin', 'gerente'))
    or exists (
      select 1 from public."BASE_DE_LEADS" l
      where l.id = conversas_resumo.lead_id
        and ((select public.get_my_cargo()) in ('admin_master', 'admin', 'gerente')
          or l.vendedor = (select public.get_my_nome()))
    )
  );

drop policy if exists "conversas_leitura_select_own" on public.conversas_leitura;
create policy "conversas_leitura_select_own"
  on public.conversas_leitura for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "conversas_leitura_insert_own" on public.conversas_leitura;
create policy "conversas_leitura_insert_own"
  on public.conversas_leitura for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "conversas_leitura_update_own" on public.conversas_leitura;
create policy "conversas_leitura_update_own"
  on public.conversas_leitura for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Vendedor so pode alterar a propria preferencia de assinatura; alteracoes de nome/cargo/
-- status continuam reservadas a gestao (admin_master/admin/gerente).
create or replace function public.restringir_autoupdate_profile_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.id
     and coalesce(public.get_my_cargo(), '') not in ('admin_master', 'admin', 'gerente')
     and (to_jsonb(new) - 'assinatura_mensagens_ativa')
       is distinct from (to_jsonb(old) - 'assinatura_mensagens_ativa') then
    raise exception 'Vendedor pode alterar somente a preferência de assinatura.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restringir_autoupdate_profile_vendedor on public.profiles;
create trigger trg_restringir_autoupdate_profile_vendedor
  before update on public.profiles
  for each row execute function public.restringir_autoupdate_profile_vendedor();

-- =========================================================================
-- Realtime: publica as tabelas que o client observa ao vivo (mensagens da conversa aberta +
-- resumo da lista). A Realtime do Supabase respeita RLS em postgres_changes, entao cada
-- vendedor so recebe eventos das conversas que ja pode ver.
-- =========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversas_mensagens'
  ) then
    alter publication supabase_realtime add table public.conversas_mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversas_resumo'
  ) then
    alter publication supabase_realtime add table public.conversas_resumo;
  end if;
end $$;

-- =========================================================================
-- Persistencia do webhook inbound (SECURITY DEFINER: so service_role executa). O parsing do
-- payload cru da UAZAPI (texto vs midia) fica na rota de API; aqui so resolve lead_id por
-- telefone (indexado) e insere de forma idempotente por provider_message_id.
-- =========================================================================
drop function if exists public.persistir_mensagem_uazapi_entrada(text, text, text, text, jsonb, text);
drop function if exists public.persistir_mensagem_uazapi_entrada(text, text, text, text, jsonb, text, timestamptz);
drop function if exists public.persistir_mensagem_uazapi_entrada(text, text, text, text, jsonb);
drop function if exists public.persistir_mensagem_uazapi_entrada(text, text, text, text);
drop function if exists public.persistir_mensagem_uazapi_entrada(text, text, text);

create or replace function public.persistir_mensagem_uazapi_entrada(
  p_provider_message_id text,
  p_chat_jid text,
  p_conteudo text,
  p_tipo text default 'text',
  p_anexo jsonb default null,
  p_direcao text default 'entrada',
  -- preenchido pela importacao de historico, que precisa manter a data/hora original do
  -- WhatsApp em vez de now() (o webhook ao vivo deixa null e usa o default da coluna).
  p_created_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_telefone_normalizado text;
  v_lead_count integer;
  v_lead_id bigint;
  v_id bigint;
begin
  if nullif(btrim(p_provider_message_id), '') is null or nullif(btrim(p_chat_jid), '') is null then
    raise exception 'Mensagem do webhook incompleta.' using errcode = '22023';
  end if;

  v_telefone_normalizado := public.normalizar_telefone(split_part(p_chat_jid, '@', 1));

  select count(*), max(id) into v_lead_count, v_lead_id
  from public."BASE_DE_LEADS"
  where telefone_normalizado = v_telefone_normalizado;
  if v_lead_count <> 1 then
    v_lead_id := null;
  end if;

  insert into public.conversas_mensagens (
    lead_id, telefone_normalizado, chat_jid, direcao, conteudo, tipo, anexo,
    status, provider_message_id, created_at
  ) values (
    v_lead_id, v_telefone_normalizado, p_chat_jid, p_direcao, p_conteudo, coalesce(p_tipo, 'text'), p_anexo,
    'entregue', p_provider_message_id, coalesce(p_created_at, now())
  )
  on conflict (provider_message_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversas_mensagens where provider_message_id = p_provider_message_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.persistir_mensagem_uazapi_entrada(text, text, text, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.persistir_mensagem_uazapi_entrada(text, text, text, text, jsonb, text, timestamptz)
  to service_role;

-- =========================================================================
-- pode_acessar_conversa: usada pelas rotas de envio (que rodam com service_role) para
-- checar, com o usuario autenticado, se ele pode enviar/ler naquele telefone. Exige telefone
-- nao ambiguo ao iniciar uma conversa que ainda nao possui resumo.
-- =========================================================================
create or replace function public.pode_acessar_conversa(p_telefone text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cargo text;
  v_nome text;
  v_telefone text;
  v_resumo_lead_id bigint;
  v_total_leads integer;
  v_vendedor_lead text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select cargo, nome into v_cargo, v_nome
  from public.profiles
  where id = auth.uid() and desativado = false;
  if not found then
    return false;
  end if;

  v_telefone := public.normalizar_telefone(p_telefone);
  if v_telefone is null then
    return false;
  end if;

  select lead_id into v_resumo_lead_id
  from public.conversas_resumo
  where telefone_normalizado = v_telefone;

  if found then
    if v_cargo in ('admin_master', 'admin', 'gerente') then
      return true;
    end if;
    return v_resumo_lead_id is not null and exists (
      select 1
      from public."BASE_DE_LEADS" l
      where l.id = v_resumo_lead_id and l.vendedor = v_nome
    );
  end if;

  select count(*), max(vendedor)
  into v_total_leads, v_vendedor_lead
  from public."BASE_DE_LEADS"
  where telefone_normalizado = v_telefone;

  return v_total_leads = 1
    and (v_cargo in ('admin_master', 'admin', 'gerente') or v_vendedor_lead = v_nome);
end;
$$;

revoke all on function public.pode_acessar_conversa(text) from public, anon;
grant execute on function public.pode_acessar_conversa(text) to authenticated;

-- =========================================================================
-- marcar_conversa_lida: versao monotonica (ja com o fix que na origem virou a migration
-- 0029) — nunca deixa uma resposta/requisicao antiga reduzir o cursor de leitura persistido.
-- =========================================================================
create or replace function public.marcar_conversa_lida(
  p_telefone_normalizado text,
  p_user_id uuid,
  p_ultima_mensagem_lida_id bigint,
  p_total_mensagens integer,
  p_atualizado_em timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Não é permitido alterar a leitura de outro usuário.' using errcode = '42501';
  end if;

  insert into public.conversas_leitura (
    telefone_normalizado,
    user_id,
    ultima_mensagem_lida_id,
    total_mensagens_na_leitura,
    atualizado_em
  ) values (
    p_telefone_normalizado,
    p_user_id,
    p_ultima_mensagem_lida_id,
    p_total_mensagens,
    p_atualizado_em
  )
  on conflict (telefone_normalizado, user_id) do update
  set ultima_mensagem_lida_id = case
        when excluded.total_mensagens_na_leitura >= conversas_leitura.total_mensagens_na_leitura
          then excluded.ultima_mensagem_lida_id
        else conversas_leitura.ultima_mensagem_lida_id
      end,
      total_mensagens_na_leitura = greatest(conversas_leitura.total_mensagens_na_leitura, excluded.total_mensagens_na_leitura),
      atualizado_em = greatest(conversas_leitura.atualizado_em, excluded.atualizado_em);
end;
$$;

revoke all on function public.marcar_conversa_lida(text, uuid, bigint, integer, timestamptz) from public, anon;
grant execute on function public.marcar_conversa_lida(text, uuid, bigint, integer, timestamptz) to authenticated, service_role;

-- =========================================================================
-- listar_conversas_cursor: keyset pagination para a caixa de entrada/sidebar.
-- Nota de divergencia de schema vs projeto de origem: BASE_DE_LEADS deste projeto NAO tem a
-- coluna "ordem_pipeline" (aqui a ordenacao do pipeline vem de public.pipeline_etapas,
-- migration 0012) — essa coluna simplesmente nao e usada aqui.
-- =========================================================================
create or replace function public.listar_conversas_cursor(
  p_limite integer default 30,
  p_cursor_em timestamptz default null,
  p_cursor_telefone text default null,
  p_busca text default null,
  p_etapa text default null,
  p_vendedor text default null,
  p_sem_lead boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cargo text;
  v_nome text;
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 60);
  v_rows jsonb;
  v_has_more boolean;
begin
  if v_uid is null then raise exception 'Não autenticado.' using errcode = '42501'; end if;
  select cargo, nome into v_cargo, v_nome from public.profiles where id = v_uid and desativado = false;
  if not found then raise exception 'Não autenticado.' using errcode = '42501'; end if;
  if p_vendedor is not null and v_cargo not in ('admin_master', 'admin', 'gerente') then
    raise exception 'Filtro não permitido.' using errcode = '42501';
  end if;

  with visible as (
    select r.*, l.nome_lead, l.telefone, l.estagio_lead, l.veiculo_interesse,
      l.resumo_comercial, l.vendedor,
      greatest(0, r.total_mensagens - coalesce(le.total_mensagens_na_leitura, 0)) as nao_lidas,
      exists (
        select 1 from public."VENDEDORES" v
        where r.lead_id is null and public.normalizar_telefone(v.telefone) = r.telefone_normalizado
      ) as eh_vendedor
    from public.conversas_resumo r
    left join public."BASE_DE_LEADS" l on l.id = r.lead_id
    left join public.conversas_leitura le on le.telefone_normalizado = r.telefone_normalizado and le.user_id = v_uid
    where
      ((r.lead_id is null and v_cargo in ('admin_master', 'admin', 'gerente'))
        or (r.lead_id is not null and (v_cargo in ('admin_master', 'admin', 'gerente') or l.vendedor = v_nome)))
      and (not p_sem_lead or r.lead_id is null)
      and (p_sem_lead or nullif(p_etapa, '') is null or l.estagio_lead = p_etapa)
      and (p_sem_lead or nullif(p_vendedor, '') is null or l.vendedor = p_vendedor)
      and (
        nullif(btrim(p_busca), '') is null
        or l.nome_lead ilike '%' || btrim(p_busca) || '%'
        or (nullif(regexp_replace(p_busca, '\D', '', 'g'), '') is not null
          and l.telefone ilike '%' || regexp_replace(p_busca, '\D', '', 'g') || '%')
        or (r.lead_id is null and nullif(regexp_replace(p_busca, '\D', '', 'g'), '') is not null
          and r.telefone_normalizado ilike '%' || regexp_replace(p_busca, '\D', '', 'g') || '%')
      )
      and (
        p_cursor_telefone is null
        or (p_cursor_em is not null and (r.ultima_mensagem_em < p_cursor_em
          or (r.ultima_mensagem_em = p_cursor_em and r.telefone_normalizado > p_cursor_telefone)))
        or (p_cursor_em is null and r.ultima_mensagem_em is null and r.telefone_normalizado > p_cursor_telefone)
      )
    order by r.ultima_mensagem_em desc nulls last, r.telefone_normalizado
    limit v_limite + 1
  ), numbered as (
    select visible.*, row_number() over (order by ultima_mensagem_em desc nulls last, telefone_normalizado) as rn from visible
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'telefoneNormalizado', telefone_normalizado,
    'leadId', lead_id,
    'name', coalesce(nome_lead, split_part(chat_jid, '@', 1), telefone_normalizado),
    'phone', coalesce(telefone, split_part(chat_jid, '@', 1), telefone_normalizado),
    'stage', estagio_lead,
    'vehicle', veiculo_interesse,
    'commercialSummary', resumo_comercial,
    'isVendor', eh_vendedor,
    'lastMessageId', ultima_mensagem_id,
    'lastMessage', ultima_mensagem_preview,
    'lastMessageTipo', ultima_mensagem_tipo,
    'lastMessageEm', ultima_mensagem_em,
    'unreadCount', nao_lidas
  ) order by rn) filter (where rn <= v_limite), '[]'::jsonb),
    coalesce(bool_or(rn > v_limite), false)
  into v_rows, v_has_more from numbered;

  return jsonb_build_object(
    'items', v_rows,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.listar_conversas_cursor(integer,timestamptz,text,text,text,text,boolean) from public, anon;
grant execute on function public.listar_conversas_cursor(integer,timestamptz,text,text,text,text,boolean) to authenticated;

-- =========================================================================
-- carregar_conversa_cursor: historico da conversa aberta, com keyset pagination, e marca a
-- leitura da pagina mais recente. O jsonb de lead abaixo NAO inclui "ordem_pipeline" (coluna
-- inexistente neste projeto — ver nota acima).
-- =========================================================================
create or replace function public.carregar_conversa_cursor(
  p_telefone text,
  p_limite integer default 60,
  p_antes_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cargo text;
  v_nome text;
  v_lead_id bigint;
  v_cursor_em timestamptz;
  v_limite integer := least(greatest(coalesce(p_limite, 60), 1), 100);
  v_messages jsonb;
  v_has_more boolean;
  v_total integer;
  v_newest_id bigint;
  v_lead jsonb;
begin
  if v_uid is null or p_telefone !~ '^\d{8,13}$' then
    raise exception 'Conversa não encontrada.' using errcode = '42501';
  end if;
  select cargo, nome into v_cargo, v_nome from public.profiles where id = v_uid and desativado = false;
  if not found then raise exception 'Conversa não encontrada.' using errcode = '42501'; end if;

  select r.lead_id, r.total_mensagens into v_lead_id, v_total
  from public.conversas_resumo r left join public."BASE_DE_LEADS" l on l.id = r.lead_id
  where r.telefone_normalizado = p_telefone
    and ((r.lead_id is null and v_cargo in ('admin_master','admin','gerente'))
      or (r.lead_id is not null and (v_cargo in ('admin_master','admin','gerente') or l.vendedor = v_nome)));
  if not found then raise exception 'Conversa não encontrada.' using errcode = '42501'; end if;

  if p_antes_id is not null then
    select created_at into v_cursor_em from public.conversas_mensagens
    where id = p_antes_id and telefone_normalizado = p_telefone;
    if not found then raise exception 'Cursor inválido.' using errcode = '22023'; end if;
  end if;

  with page as (
    select m.* from public.conversas_mensagens m
    where m.telefone_normalizado = p_telefone
      and (p_antes_id is null or m.created_at < v_cursor_em or (m.created_at = v_cursor_em and m.id < p_antes_id))
    order by m.created_at desc, m.id desc
    limit v_limite + 1
  ), numbered as (select page.*, row_number() over () rn from page)
  select
    coalesce(jsonb_agg(to_jsonb(numbered) - 'rn' order by created_at, id) filter (where rn <= v_limite), '[]'::jsonb),
    coalesce(bool_or(rn > v_limite), false),
    (array_agg(id order by rn) filter (where rn <= v_limite))[1]
  into v_messages, v_has_more, v_newest_id from numbered;

  if v_lead_id is not null then
    select jsonb_build_object(
      'id', l.id, 'id_empresa', l.id_empresa, 'nome_lead', l.nome_lead, 'telefone', l.telefone,
      'email', l.email, 'origem', l.origem, 'vendedor', l.vendedor,
      'veiculo_interesse', l.veiculo_interesse, 'resumo_qualificacao', l.resumo_qualificacao,
      'estagio_lead', l.estagio_lead,
      'resumo_comercial', l.resumo_comercial, 'created_at', l.created_at, 'updated_at', l.updated_at,
      'valor', l.valor, 'observacao_vendedor', l.observacao_vendedor, 'bot_ativo', l.bot_ativo,
      'bot_ativo_alterado_em', l.bot_ativo_alterado_em, 'Etapa', l."Etapa",
      'QuemEnviouMsg', l."QuemEnviouMsg", 'UltimaMensagem', l."UltimaMensagem",
      'StatusDeFollow', l."Status de Follow", 'Transferencia', l."Transferencia",
      'PesquisaDeSatisfacao', l."Pesquisa de satisfação", 'IdContatoClick', l."ID CONTATO CLICK",
      'lid', l.lid, 'DataEHora', l."Data e Hora", 'cpf', l.cpf,
      'data_nascimento', l.data_nascimento, 'score_serasa', l.score_serasa,
      'telefone_normalizado', l.telefone_normalizado
    ) into v_lead from public."BASE_DE_LEADS" l where l.id = v_lead_id;
  end if;

  if p_antes_id is null and v_newest_id is not null then
    insert into public.conversas_leitura(telefone_normalizado,user_id,ultima_mensagem_lida_id,total_mensagens_na_leitura,atualizado_em)
    values(p_telefone,v_uid,v_newest_id,v_total,now())
    on conflict (telefone_normalizado,user_id) do update set
      ultima_mensagem_lida_id = greatest(conversas_leitura.ultima_mensagem_lida_id, excluded.ultima_mensagem_lida_id),
      total_mensagens_na_leitura = greatest(conversas_leitura.total_mensagens_na_leitura, excluded.total_mensagens_na_leitura),
      atualizado_em = greatest(conversas_leitura.atualizado_em, excluded.atualizado_em);
  end if;

  return jsonb_build_object('messages',v_messages,'hasMore',v_has_more,'totalMessages',v_total,'lead',v_lead);
end;
$$;

revoke all on function public.carregar_conversa_cursor(text,integer,bigint) from public, anon;
grant execute on function public.carregar_conversa_cursor(text,integer,bigint) to authenticated;

-- =========================================================================
-- Bucket privado para midia recebida/enviada (audio/imagem/video/documento). O arquivo e
-- baixado e guardado no momento do recebimento/envio (nao e proxy ao vivo da UAZAPI). Sem
-- policies para authenticated/anon: acesso so via service_role (upload) e URLs assinadas de
-- curta duracao geradas pela rota de API.
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('conversas-midia', 'conversas-midia', false)
on conflict (id) do nothing;
