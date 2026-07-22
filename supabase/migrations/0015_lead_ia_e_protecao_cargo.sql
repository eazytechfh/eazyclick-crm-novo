-- Controle transacional da IA por lead e proteção contra autoelevação de cargo.

do $$
declare
  v_tipo text;
  v_invalido text;
begin
  select data_type into v_tipo
  from information_schema.columns
  where table_schema = 'public' and table_name = 'BASE_DE_LEADS' and column_name = 'bot_ativo';

  if v_tipo is null then
    alter table public."BASE_DE_LEADS" add column bot_ativo boolean;
  elsif v_tipo <> 'boolean' then
    execute $query$
      select bot_ativo::text
      from public."BASE_DE_LEADS"
      where bot_ativo is not null
        and lower(trim(bot_ativo::text)) not in ('true', 'false', 'ativo', 'inativo', '1', '0')
      limit 1
    $query$ into v_invalido;

    if v_invalido is not null then
      raise exception 'Valor legado incompatível em BASE_DE_LEADS.bot_ativo.' using errcode = '22000';
    end if;

    alter table public."BASE_DE_LEADS" alter column bot_ativo drop default;
    alter table public."BASE_DE_LEADS"
      alter column bot_ativo type boolean
      using lower(trim(bot_ativo::text)) in ('true', 'ativo', '1');
  end if;
end;
$$;

update public."BASE_DE_LEADS"
set bot_ativo = false
where bot_ativo is null;

alter table public."BASE_DE_LEADS"
  alter column bot_ativo set default false,
  alter column bot_ativo set not null;

alter table public."BASE_DE_LEADS"
  add column if not exists bot_ativo_alterado_em timestamptz;

create or replace function public.registrar_alteracao_bot_ativo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bot_ativo is distinct from old.bot_ativo then
    new.bot_ativo_alterado_em := now();
  else
    new.bot_ativo_alterado_em := old.bot_ativo_alterado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registrar_alteracao_bot_ativo on public."BASE_DE_LEADS";
create trigger trg_registrar_alteracao_bot_ativo
  before update of bot_ativo, bot_ativo_alterado_em on public."BASE_DE_LEADS"
  for each row execute function public.registrar_alteracao_bot_ativo();

create or replace function public.proteger_alteracao_cargo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cargo is distinct from old.cargo then
    if auth.uid() = old.id then
      raise exception 'Não é permitido alterar o próprio cargo.' using errcode = '42501';
    end if;
    if coalesce(public.get_my_cargo(), '') not in ('admin_master', 'admin', 'gerente') then
      raise exception 'Sem permissão para alterar cargo.' using errcode = '42501';
    end if;
    if new.cargo = 'admin_master' and public.get_my_cargo() <> 'admin_master' then
      raise exception 'Somente admin_master pode atribuir esse cargo.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_alteracao_cargo on public.profiles;
create trigger trg_proteger_alteracao_cargo
  before update of cargo on public.profiles
  for each row execute function public.proteger_alteracao_cargo();
