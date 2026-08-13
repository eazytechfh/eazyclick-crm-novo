-- Expõe, na própria BASE_DE_LEADS, a lista de IDs das etiquetas atribuídas.
-- lead_etiquetas permanece como relação normalizada e é sincronizada nos dois sentidos.

alter table public."BASE_DE_LEADS"
  add column if not exists etiquetas bigint[] not null default '{}'::bigint[];

-- Importa os vínculos que já existiam antes da criação da coluna.
update public."BASE_DE_LEADS" as l
set etiquetas = coalesce(
  (
    select array_agg(le.id_etiqueta order by le.id_etiqueta)
    from public.lead_etiquetas le
    where le.id_lead = l.id
  ),
  '{}'::bigint[]
);

create or replace function public.normalizar_e_validar_etiquetas_do_lead()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  id_inexistente bigint;
begin
  select array_agg(ids.id_etiqueta order by ids.id_etiqueta)
  into new.etiquetas
  from (
    select distinct id_etiqueta
    from unnest(coalesce(new.etiquetas, '{}'::bigint[])) as u(id_etiqueta)
    where id_etiqueta is not null
  ) as ids;

  new.etiquetas := coalesce(new.etiquetas, '{}'::bigint[]);

  select ids.id_etiqueta
  into id_inexistente
  from unnest(coalesce(new.etiquetas, '{}'::bigint[])) as ids(id_etiqueta)
  left join public.etiquetas e on e.id = ids.id_etiqueta
  where e.id is null
  limit 1;

  if id_inexistente is not null then
    raise exception 'Etiqueta com ID % nao existe', id_inexistente
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function public.sync_base_de_leads_etiquetas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.lead_etiquetas
  where id_lead = new.id
    and id_etiqueta <> all (new.etiquetas);

  insert into public.lead_etiquetas (id_lead, id_etiqueta)
  select new.id, id_etiqueta
  from unnest(new.etiquetas) as ids(id_etiqueta)
  on conflict (id_lead, id_etiqueta) do nothing;

  return new;
end;
$$;

create or replace function public.sync_lead_etiquetas_para_base()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  lead_id int4;
begin
  if tg_op = 'DELETE' then
    lead_id := old.id_lead;
  else
    lead_id := new.id_lead;
  end if;

  update public."BASE_DE_LEADS" as l
  set etiquetas = coalesce(
    (
      select array_agg(le.id_etiqueta order by le.id_etiqueta)
      from public.lead_etiquetas le
      where le.id_lead = lead_id
    ),
    '{}'::bigint[]
  )
  where l.id = lead_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalizar_etiquetas_do_lead on public."BASE_DE_LEADS";
create trigger trg_normalizar_etiquetas_do_lead
before insert or update of etiquetas on public."BASE_DE_LEADS"
for each row execute function public.normalizar_e_validar_etiquetas_do_lead();

drop trigger if exists trg_sync_base_de_leads_etiquetas on public."BASE_DE_LEADS";
create trigger trg_sync_base_de_leads_etiquetas
after insert or update of etiquetas on public."BASE_DE_LEADS"
for each row execute function public.sync_base_de_leads_etiquetas();

drop trigger if exists trg_sync_lead_etiquetas_para_base on public.lead_etiquetas;
create trigger trg_sync_lead_etiquetas_para_base
after insert or delete on public.lead_etiquetas
for each row execute function public.sync_lead_etiquetas_para_base();

comment on column public."BASE_DE_LEADS".etiquetas is
  'Lista de IDs de public.etiquetas; sincronizada automaticamente com public.lead_etiquetas.';
