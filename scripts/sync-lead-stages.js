#!/usr/bin/env node

require('dotenv').config({ path: '.env.local', quiet: true });

const { createClient } = require('@supabase/supabase-js');
const { buildAudit, buildMutationGroups, parseMode } = require('./sync-lead-stages-lib');

const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 200;

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadAll(supabase, table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

function summarize(audit, mutations, mode) {
  const currentToSuggested = {};
  let transferLeads = 0;
  for (const proposal of audit.proposals) {
    const key = `${proposal.currentStage} -> ${proposal.suggestedStage}`;
    currentToSuggested[key] = (currentToSuggested[key] ?? 0) + 1;
    if (proposal.transfer) transferLeads += 1;
  }
  return {
    mode,
    matchedLeads: audit.proposals.length,
    excludedSessions: audit.excluded,
    transferLeads,
    stageRowsToUpdate: mutations.historyRows.length,
    botRowsChangingToFalse: audit.proposals.filter((proposal) => proposal.setBotInactive).length,
    botRowsEnforcedFalse: mutations.botInactiveIds.length,
    currentToSuggested,
  };
}

async function applyMutations(supabase, mutations) {
  let stageUpdated = 0;
  let historyInserted = 0;
  let botUpdated = 0;

  for (const transition of mutations.stageTransitions) {
    const { currentStage, suggestedStage, ids } = transition;
    for (const batch of chunks(ids, WRITE_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from('BASE_DE_LEADS')
        .update({ estagio_lead: suggestedStage })
        .in('id', batch)
        .eq('estagio_lead', currentStage)
        .select('id');
      if (error) throw new Error(`Falha ao atualizar estágio ${suggestedStage}: ${error.message}`);
      if (data.length !== batch.length) {
        if (data.length) {
          const rollback = await supabase
            .from('BASE_DE_LEADS')
            .update({ estagio_lead: currentStage })
            .in('id', data.map((row) => row.id))
            .eq('estagio_lead', suggestedStage)
            .select('id');
          if (rollback.error || rollback.data.length !== data.length) {
            throw new Error(`Conflito concorrente e rollback incompleto em ${suggestedStage}`);
          }
        }
        throw new Error(`Conflito concorrente em ${suggestedStage}: esperado ${batch.length}, atualizado ${data.length}; lote revertido`);
      }
      stageUpdated += data.length;

      const historyBatch = mutations.historyRows.filter((row) => batch.includes(row.id_lead));
      const inserted = await supabase.from('lead_historico_estagio').insert(historyBatch).select('id');
      if (inserted.error || inserted.data.length !== historyBatch.length) {
        const rollback = await supabase
          .from('BASE_DE_LEADS')
          .update({ estagio_lead: currentStage })
          .in('id', batch)
          .eq('estagio_lead', suggestedStage)
          .select('id');
        if (rollback.error || rollback.data.length !== batch.length) {
          throw new Error(`Falha no histórico e rollback incompleto em ${suggestedStage}`);
        }
        throw new Error(`Falha no histórico; lote de ${suggestedStage} revertido: ${inserted.error?.message ?? 'contagem parcial'}`);
      }
      historyInserted += inserted.data.length;
    }
  }

  for (const batch of chunks(mutations.botInactiveIds, WRITE_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('BASE_DE_LEADS')
      .update({ bot_ativo: 'false' })
      .in('id', batch)
      .select('id');
    if (error) throw new Error(`Falha ao desativar bot: ${error.message}`);
    if (data.length !== batch.length) {
      throw new Error(`Desativação parcial do bot: esperado ${batch.length}, recebido ${data.length}`);
    }
    botUpdated += data.length;
  }

  return { stageUpdated, historyInserted, botUpdated };
}

async function verify(supabase, proposals) {
  const expected = proposals.filter(
    (proposal) => proposal.currentStage !== proposal.suggestedStage || proposal.setBotInactive
  );
  const actual = new Map();
  for (const batch of chunks(expected.map((proposal) => proposal.id), WRITE_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('BASE_DE_LEADS')
      .select('id,estagio_lead,bot_ativo')
      .in('id', batch);
    if (error) throw new Error(`Falha na verificação: ${error.message}`);
    for (const row of data) actual.set(row.id, row);
  }

  const inconsistencies = expected.filter((proposal) => {
    const row = actual.get(proposal.id);
    if (!row || row.estagio_lead !== proposal.suggestedStage) return true;
    return proposal.transfer && String(row.bot_ativo).toLowerCase() !== 'false';
  });
  return { checked: expected.length, inconsistencies: inconsistencies.length };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Credenciais do Supabase ausentes em .env.local');

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [histories, leads, vendors] = await Promise.all([
    loadAll(supabase, 'atualveiculos_chat_histories', 'id,session_id,message'),
    loadAll(supabase, 'BASE_DE_LEADS', 'id,telefone,estagio_lead,bot_ativo'),
    loadAll(supabase, 'VENDEDORES', 'id,telefone'),
  ]);
  const audit = buildAudit({ histories, leads, vendors });
  if (audit.excluded.ambiguous > 0) {
    throw new Error(`Abortado: ${audit.excluded.ambiguous} sessões correspondem a mais de um lead`);
  }
  const mutations = buildMutationGroups(audit.proposals);
  console.log(JSON.stringify(summarize(audit, mutations, mode.apply ? 'apply' : 'dry-run'), null, 2));
  if (!mode.apply) return;

  const applied = await applyMutations(supabase, mutations);
  const verification = await verify(supabase, audit.proposals);
  console.log(JSON.stringify({ applied, verification }, null, 2));
  if (verification.inconsistencies > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
