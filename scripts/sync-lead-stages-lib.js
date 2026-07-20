const LATER_STAGES = new Set(['follow_up', 'fechado', 'nao_fechou', 'pesquisa_atendimento']);

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizePhoneCandidates(value) {
  const digits = onlyDigits(value);
  const candidates = new Set(digits ? [digits] : []);

  if (digits.length === 10 || digits.length === 11) candidates.add(`55${digits}`);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    candidates.add(digits.slice(2));
  }

  return [...candidates];
}

function phonesMatch(left, right) {
  const rightCandidates = new Set(normalizePhoneCandidates(right));
  return normalizePhoneCandidates(left).some((candidate) => rightCandidates.has(candidate));
}

function isConfirmedTransfer(content) {
  const text = String(content ?? '').toLowerCase();
  return /\b(estou|vou|irei|vamos)\s+(te\s+|lhe\s+|você\s+)?(transferindo|transferir|encaminhar)|\b(te|lhe|você)\s+(transferindo|encaminhando)|\btransferindo\s+(agora|você)|\bencaminhando\s+(agora|você)/i.test(text);
}

function systemText(message) {
  if (!message || typeof message.content !== 'string') return '';
  try {
    const parsed = JSON.parse(message.content);
    return typeof parsed.text === 'string' ? parsed.text : message.content;
  } catch {
    return message.content;
  }
}

function notificationContact(message) {
  const match = systemText(message).match(/contato:\s*\+?([0-9][0-9\s().-]{8,20})/i);
  return match ? onlyDigits(match[1]) : null;
}

function parseMode(args) {
  const unknown = args.filter((arg) => arg !== '--apply');
  if (unknown.length) throw new Error(`Argumento desconhecido: ${unknown.join(', ')}`);
  return { apply: args.includes('--apply') };
}

function buildPhoneIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const phone of normalizePhoneCandidates(row.telefone)) {
      if (!index.has(phone)) index.set(phone, new Map());
      index.get(phone).set(row.id, row);
    }
  }
  return index;
}

function matchingRows(index, phone) {
  const rows = new Map();
  for (const candidate of normalizePhoneCandidates(phone)) {
    for (const [id, row] of index.get(candidate) ?? []) rows.set(id, row);
  }
  return [...rows.values()];
}

function buildAudit({ leads, vendors, histories }) {
  const leadIndex = buildPhoneIndex(leads);
  const vendorPhones = new Set(vendors.flatMap((vendor) => normalizePhoneCandidates(vendor.telefone)));
  const notificationRecipients = new Set();
  const sessions = new Map();

  for (const row of histories) {
    const sessionPhone = onlyDigits(String(row.session_id ?? '').replace('@s.whatsapp.net', ''));
    if (!sessions.has(sessionPhone)) {
      sessions.set(sessionPhone, { human: 0, ai: 0, transfer: false });
    }

    const session = sessions.get(sessionPhone);
    const message = row.message && typeof row.message === 'object' ? row.message : {};
    if (message.type === 'human') session.human += 1;
    if (message.type === 'ai') {
      session.ai += 1;
      if (isConfirmedTransfer(message.content)) session.transfer = true;
    }
    if (message.type === 'system') {
      const contact = notificationContact(message);
      if (contact && !phonesMatch(sessionPhone, contact)) notificationRecipients.add(sessionPhone);
    }
  }

  const perLead = new Map();
  const excluded = { vendor: 0, notificationRecipient: 0, unmatched: 0, ambiguous: 0 };

  for (const [sessionPhone, session] of sessions) {
    const candidates = normalizePhoneCandidates(sessionPhone);
    if (candidates.some((phone) => vendorPhones.has(phone))) {
      excluded.vendor += 1;
      continue;
    }
    if (notificationRecipients.has(sessionPhone)) {
      excluded.notificationRecipient += 1;
      continue;
    }

    const matched = matchingRows(leadIndex, sessionPhone);
    if (!matched.length) {
      excluded.unmatched += 1;
      continue;
    }
    if (matched.length > 1) {
      excluded.ambiguous += 1;
      continue;
    }

    const lead = matched[0];
    const rank = session.transfer ? 3 : session.ai ? 2 : session.human ? 1 : 0;
    const current = perLead.get(lead.id) ?? { lead, rank: 0, transfer: false };
    current.rank = Math.max(current.rank, rank);
    current.transfer ||= session.transfer;
    perLead.set(lead.id, current);
  }

  const proposals = [...perLead.values()]
    .map(({ lead, rank, transfer }) => {
      let suggestedStage = lead.estagio_lead;
      if (rank === 3 && !LATER_STAGES.has(suggestedStage)) suggestedStage = 'em_negociacao';
      else if (rank === 2 && suggestedStage === 'oportunidade') suggestedStage = 'em_qualificacao';

      const botAlreadyInactive = String(lead.bot_ativo).toLowerCase() === 'false';
      return {
        id: lead.id,
        currentStage: lead.estagio_lead,
        suggestedStage,
        transfer,
        setBotInactive: transfer && !botAlreadyInactive,
      };
    })
    .sort((left, right) => left.id - right.id);

  return { proposals, excluded };
}

function buildMutationGroups(proposals) {
  const stageGroups = {};
  const transitionMap = new Map();
  const botInactiveIds = [];
  const historyRows = [];

  for (const proposal of proposals) {
    if (proposal.currentStage !== proposal.suggestedStage) {
      if (!stageGroups[proposal.suggestedStage]) stageGroups[proposal.suggestedStage] = [];
      stageGroups[proposal.suggestedStage].push(proposal.id);
      const transitionKey = `${proposal.currentStage}\u0000${proposal.suggestedStage}`;
      if (!transitionMap.has(transitionKey)) {
        transitionMap.set(transitionKey, {
          currentStage: proposal.currentStage,
          suggestedStage: proposal.suggestedStage,
          ids: [],
        });
      }
      transitionMap.get(transitionKey).ids.push(proposal.id);
      historyRows.push({
        id_lead: proposal.id,
        estagio_anterior: proposal.currentStage,
        estagio_novo: proposal.suggestedStage,
        usuario: 'automacao_conversas',
      });
    }
    if (proposal.transfer) botInactiveIds.push(proposal.id);
  }

  return { stageGroups, stageTransitions: [...transitionMap.values()], botInactiveIds, historyRows };
}

module.exports = {
  buildAudit,
  buildMutationGroups,
  isConfirmedTransfer,
  normalizePhoneCandidates,
  parseMode,
};
