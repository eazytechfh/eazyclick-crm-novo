-- Correções de segurança, retenção de auditoria e atualização em tempo real.
-- Esta migration não aplica o schema automaticamente fora do fluxo normal de migrations.

-- Auditoria precisa sobreviver à exclusão do lead.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.lead_logs'::regclass
      and contype = 'f'
      and confrelid = 'public."BASE_DE_LEADS"'::regclass
  loop
    execute format('alter table public.lead_logs drop constraint %I', v_constraint);
  end loop;
end $$;

drop policy if exists "lead_logs_select_authenticated" on public.lead_logs;
create policy "lead_logs_select_authenticated"
  on public.lead_logs for select to authenticated
  using (
    exists (
      select 1
      from public."BASE_DE_LEADS" lead
      where lead.id = lead_logs.id_lead
    )
    or public.get_my_cargo() in ('admin_master', 'admin', 'gerente')
  );

create or replace function public.audit_base_de_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_acao text;
  v_id int4;
  v_detalhes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  select coalesce(nullif(btrim(nome), ''), email)
    into v_nome from public.profiles where id = v_uid;
  v_nome := coalesce(v_nome, case when v_uid is null then 'Sistema' else 'Usuário desconhecido' end);

  if tg_op = 'DELETE' then
    v_acao := 'lead_excluido';
    v_detalhes := jsonb_build_object('nome_lead', old.nome_lead);
  elsif tg_op = 'INSERT' then
    v_acao := 'lead_criado';
    v_detalhes := jsonb_build_object('nome_lead', new.nome_lead);
  else
    v_old := to_jsonb(old) - array['updated_at'];
    v_new := to_jsonb(new) - array['updated_at'];
    v_detalhes := (
      select jsonb_build_object(
        'campos_alterados', coalesce(jsonb_agg(chave), '[]'::jsonb),
        'antes', coalesce(jsonb_object_agg(chave, v_old -> chave), '{}'::jsonb),
        'depois', coalesce(jsonb_object_agg(chave, v_new -> chave), '{}'::jsonb)
      )
      from jsonb_object_keys(v_new) chave
      where v_old -> chave is distinct from v_new -> chave
    );
    if old.observacao_vendedor is distinct from new.observacao_vendedor then
      v_acao := case
        when nullif(btrim(coalesce(old.observacao_vendedor, '')), '') is null
          then 'observacao_adicionada'
        else 'observacao_alterada'
      end;
    elsif old.vendedor is distinct from new.vendedor then
      v_acao := 'lead_transferido';
    elsif old.estagio_lead is distinct from new.estagio_lead then
      v_acao := 'estagio_alterado';
    else
      v_acao := 'lead_atualizado';
    end if;
  end if;

  insert into public.lead_logs(id_lead, acao, responsavel_id, responsavel_nome, detalhes)
  values(v_id, v_acao, v_uid, v_nome, v_detalhes);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_audit_base_de_leads on public."BASE_DE_LEADS";
create trigger trg_audit_base_de_leads
  after insert or update or delete on public."BASE_DE_LEADS"
  for each row execute function public.audit_base_de_leads();

-- Não imponha constraint nova sobre status compartilhado sem validar todas as automações.
alter table public."ESTOQUE" drop constraint if exists estoque_status_canonico;

-- Realtime é o caminho principal; polling no client fica apenas como contingência.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'BASE_DE_LEADS'
  ) then
    alter publication supabase_realtime add table public."BASE_DE_LEADS";
  end if;
end $$;
