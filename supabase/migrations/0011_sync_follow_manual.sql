-- Mantem follow_manual sempre sincronizado com o estagio do lead.
-- Isso protege tambem alteracoes feitas fora do CRM, como automacoes n8n/webhooks.

create or replace function public.sync_follow_manual_from_estagio()
returns trigger
language plpgsql
as $$
begin
  new.follow_manual := case
    when lower(coalesce(new.estagio_lead, '')) = 'follow_up' then 'ativo'
    else 'inativo'
  end;

  return new;
end;
$$;

drop trigger if exists trg_sync_follow_manual_from_estagio on public."BASE_DE_LEADS";

create trigger trg_sync_follow_manual_from_estagio
  before insert or update of estagio_lead on public."BASE_DE_LEADS"
  for each row
  execute function public.sync_follow_manual_from_estagio();

update public."BASE_DE_LEADS"
set follow_manual = case
  when lower(coalesce(estagio_lead, '')) = 'follow_up' then 'ativo'
  else 'inativo'
end
where follow_manual is distinct from case
  when lower(coalesce(estagio_lead, '')) = 'follow_up' then 'ativo'
  else 'inativo'
end;
