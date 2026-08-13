-- Move para Resgate o lead em Follow-up que ja recebeu a mensagem de sistema "bom dia".
-- O historico de chat e relacionado ao telefone do lead pelo session_id.

insert into public.pipeline_etapas (slug, nome, cor, ordem, is_inicial)
select
  'resgate',
  'Resgate',
  '#eab308',
  coalesce(max(ordem), -1) + 1,
  false
from public.pipeline_etapas
on conflict (slug) do nothing;

create or replace function public.mover_follow_up_bom_dia_para_resgate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is not null
    and new.message ->> 'type' = 'system'
    and new.message ->> 'content' in ('bom dia', 'Bom dia')
  then
    update public."BASE_DE_LEADS" as l
    set estagio_lead = 'resgate'
    where regexp_replace(coalesce(l.telefone, ''), '[^0-9]', '', 'g') <> ''
      and regexp_replace(l.telefone, '[^0-9]', '', 'g') =
          regexp_replace(new.session_id::text, '[^0-9]', '', 'g')
      and l.estagio_lead = 'follow_up'
      and lower(coalesce(l.follow_manual::text, '')) = 'ativo'
      and lower(coalesce(l.ja_recebeu_msg::text, '')) = 'sim';
  end if;

  return new;
end;
$$;

revoke all on function public.mover_follow_up_bom_dia_para_resgate() from public;

drop trigger if exists trg_mover_follow_up_bom_dia_para_resgate
  on public.alescar1_chat_histories;

create trigger trg_mover_follow_up_bom_dia_para_resgate
  after insert or update of message, session_id
  on public.alescar1_chat_histories
  for each row
  execute function public.mover_follow_up_bom_dia_para_resgate();

-- Processa tambem leads que ja satisfaziam a regra antes da criacao do trigger.
update public."BASE_DE_LEADS" as l
set estagio_lead = 'resgate'
where l.estagio_lead = 'follow_up'
  and lower(coalesce(l.follow_manual::text, '')) = 'ativo'
  and lower(coalesce(l.ja_recebeu_msg::text, '')) = 'sim'
  and regexp_replace(coalesce(l.telefone, ''), '[^0-9]', '', 'g') <> ''
  and exists (
    select 1
    from public.alescar1_chat_histories as h
    where h.session_id is not null
      and regexp_replace(h.session_id::text, '[^0-9]', '', 'g') =
          regexp_replace(l.telefone, '[^0-9]', '', 'g')
      and h.message ->> 'type' = 'system'
      and h.message ->> 'content' in ('bom dia', 'Bom dia')
  );
