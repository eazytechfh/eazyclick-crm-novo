-- CRM automotivo: vincula obrigatoriamente a venda ao estoque e conclui ambos atomicamente.
-- Aplicar uma única vez após a migration 0017. Não executada automaticamente por este arquivo.

alter table public."BASE_DE_LEADS"
  add column if not exists estoque_veiculo_id text;

create or replace function public.validar_venda_fechada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(btrim(coalesce(new.estagio_lead, ''))) = 'fechado'
     and (tg_op = 'INSERT' or old.estagio_lead is distinct from new.estagio_lead)
     and (
       nullif(btrim(coalesce(new.nome_lead, '')), '') is null
       or new.valor is null
       or new.valor <= 0
       or nullif(btrim(coalesce(new.estoque_veiculo_id, '')), '') is null
     )
  then
    raise exception 'Venda fechada exige nome, valor maior que zero e veículo do estoque.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.observacao_vendedor is distinct from old.observacao_vendedor then
    new.observacao_autor_id := auth.uid();
    select coalesce(nullif(btrim(nome), ''), email, 'Usuário desconhecido')
      into new.observacao_autor_nome
      from public.profiles
      where id = auth.uid();
    new.observacao_autor_nome := coalesce(new.observacao_autor_nome, 'Sistema');
    new.observacao_atualizada_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_venda_fechada on public."BASE_DE_LEADS";
create trigger trg_validar_venda_fechada
  before insert or update on public."BASE_DE_LEADS"
  for each row execute function public.validar_venda_fechada();

create or replace function public.fechar_venda_com_veiculo(
  p_id_lead int4,
  p_nome text,
  p_valor numeric,
  p_estoque_id text
)
returns public."BASE_DE_LEADS"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public."BASE_DE_LEADS"%rowtype;
  v_resultado public."BASE_DE_LEADS"%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null
     or p_valor is null
     or p_valor <= 0
     or nullif(btrim(coalesce(p_estoque_id, '')), '') is null
  then
    raise exception 'Nome, valor e veículo são obrigatórios.' using errcode = '22023';
  end if;

  select *
    into v_lead
    from public."BASE_DE_LEADS" lead
    where lead.id = p_id_lead
    for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if coalesce(public.get_my_cargo(), '') not in ('admin_master', 'admin', 'gerente')
     and coalesce(lower(btrim(v_lead.vendedor)), '')
       <> coalesce(lower(btrim(public.get_my_nome())), '')
  then
    raise exception 'Sem permissão para fechar esta venda.' using errcode = '42501';
  end if;

  select status
    into v_status
    from public."ESTOQUE" estoque
    where estoque.id::text = p_estoque_id
    for update;
  if not found then
    raise exception 'Veículo não encontrado.' using errcode = 'P0002';
  end if;

  if translate(lower(btrim(coalesce(v_status, ''))),
      'áàâãéêíóôõúç', 'aaaaeeiooouc') <> 'disponivel'
  then
    raise exception 'O veículo selecionado não está disponível.' using errcode = '23514';
  end if;

  update public."ESTOQUE"
     set status = 'vendido', updated_at = now()
   where id::text = p_estoque_id;

  update public."BASE_DE_LEADS"
     set nome_lead = btrim(p_nome),
         valor = p_valor,
         estagio_lead = 'fechado',
         follow_manual = 'inativo',
         estoque_veiculo_id = p_estoque_id
   where id = p_id_lead
   returning * into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.fechar_venda_com_veiculo(int4, text, numeric, text)
  from public, anon;
grant execute on function public.fechar_venda_com_veiculo(int4, text, numeric, text)
  to authenticated;

notify pgrst, 'reload schema';
