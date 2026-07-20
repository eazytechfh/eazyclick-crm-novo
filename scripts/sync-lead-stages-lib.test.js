const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAudit,
  buildMutationGroups,
  isConfirmedTransfer,
  normalizePhoneCandidates,
  parseMode,
} = require('./sync-lead-stages-lib');

test('normaliza telefones brasileiros com e sem código 55', () => {
  assert.deepEqual(normalizePhoneCandidates('(54) 99999-0000'), ['54999990000', '5554999990000']);
  assert.deepEqual(normalizePhoneCandidates('5554999990000@s.whatsapp.net'), ['5554999990000', '54999990000']);
});

test('reconhece transferência confirmada e rejeita mera oferta', () => {
  assert.equal(isConfirmedTransfer('Vou transferir você agora para um consultor.'), true);
  assert.equal(isConfirmedTransfer('Estou te encaminhando para um vendedor.'), true);
  assert.equal(isConfirmedTransfer('Você deseja que eu transfira para um consultor?'), false);
});

test('dry-run é o modo padrão e escrita exige --apply', () => {
  assert.deepEqual(parseMode([]), { apply: false });
  assert.deepEqual(parseMode(['--apply']), { apply: true });
});

test('ignora system e exclui sessão de vendedor ou receptora de notificação', () => {
  const histories = [
    { id: 1, session_id: '5554999990000@s.whatsapp.net', message: { type: 'system', content: JSON.stringify({ text: 'Novo Lead Atribuido a você!\nContato: 5554888880000' }) } },
    { id: 2, session_id: '5554999990000@s.whatsapp.net', message: { type: 'ai', content: 'Vou transferir você agora.' } },
    { id: 3, session_id: '5554888880000@s.whatsapp.net', message: { type: 'human', content: 'Olá' } },
    { id: 4, session_id: '5554888880000@s.whatsapp.net', message: { type: 'ai', content: 'Olá, como posso ajudar?' } },
  ];
  const audit = buildAudit({
    histories,
    vendors: [{ id: 10, telefone: '54999990000' }],
    leads: [
      { id: 20, telefone: '54999990000', estagio_lead: 'oportunidade', bot_ativo: 'true' },
      { id: 21, telefone: '54888880000', estagio_lead: 'oportunidade', bot_ativo: 'true' },
    ],
  });

  assert.equal(audit.proposals.length, 1);
  assert.deepEqual(audit.proposals[0], {
    id: 21,
    currentStage: 'oportunidade',
    suggestedStage: 'em_qualificacao',
    transfer: false,
    setBotInactive: false,
  });
});

test('transfere para negociação, desliga bot e preserva etapa posterior', () => {
  const histories = [
    { id: 1, session_id: '5554111110000@s.whatsapp.net', message: { type: 'human', content: 'Quero comprar' } },
    { id: 2, session_id: '5554111110000@s.whatsapp.net', message: { type: 'ai', content: 'Vou transferir você agora para nosso vendedor.' } },
    { id: 3, session_id: '5554222220000@s.whatsapp.net', message: { type: 'ai', content: 'Estou te encaminhando para um consultor.' } },
  ];
  const audit = buildAudit({
    histories,
    vendors: [],
    leads: [
      { id: 1, telefone: '54111110000', estagio_lead: 'oportunidade', bot_ativo: 'true' },
      { id: 2, telefone: '54222220000', estagio_lead: 'follow_up', bot_ativo: 'true' },
    ],
  });

  assert.deepEqual(audit.proposals, [
    { id: 1, currentStage: 'oportunidade', suggestedStage: 'em_negociacao', transfer: true, setBotInactive: true },
    { id: 2, currentStage: 'follow_up', suggestedStage: 'follow_up', transfer: true, setBotInactive: true },
  ]);
});

test('gera lotes mínimos e histórico somente para mudanças de estágio', () => {
  const mutations = buildMutationGroups([
    { id: 1, currentStage: 'oportunidade', suggestedStage: 'em_qualificacao', transfer: false, setBotInactive: false },
    { id: 2, currentStage: 'em_qualificacao', suggestedStage: 'em_negociacao', transfer: true, setBotInactive: true },
    { id: 3, currentStage: 'follow_up', suggestedStage: 'follow_up', transfer: true, setBotInactive: true },
    { id: 4, currentStage: 'em_negociacao', suggestedStage: 'em_negociacao', transfer: true, setBotInactive: false },
  ]);

  assert.deepEqual(mutations.stageGroups, {
    em_qualificacao: [1],
    em_negociacao: [2],
  });
  assert.deepEqual(mutations.stageTransitions, [
    { currentStage: 'oportunidade', suggestedStage: 'em_qualificacao', ids: [1] },
    { currentStage: 'em_qualificacao', suggestedStage: 'em_negociacao', ids: [2] },
  ]);
  assert.deepEqual(mutations.botInactiveIds, [2, 3, 4]);
  assert.deepEqual(mutations.historyRows, [
    { id_lead: 1, estagio_anterior: 'oportunidade', estagio_novo: 'em_qualificacao', usuario: 'automacao_conversas' },
    { id_lead: 2, estagio_anterior: 'em_qualificacao', estagio_novo: 'em_negociacao', usuario: 'automacao_conversas' },
  ]);
});
