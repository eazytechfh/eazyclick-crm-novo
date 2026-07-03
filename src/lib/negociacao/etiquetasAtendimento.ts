// Etiquetas são cadastradas livremente em Configurações > Etiquetas (nome + cor), então o
// vínculo delas com o cronômetro de negociação só pode ser feito pelo NOME, normalizado (sem
// acento, minúsculo, sem espaços nas pontas). Para ativar o comportamento, cadastre etiquetas
// com esses nomes (acentuação/maiúsculas não importam):
//   "Atendimento iniciado"  -> o cronômetro do lead fica verde.
//   "Atendimento finalizado" -> o cronômetro some do card do Pipeline e do painel de negociações.

export type StatusAtendimento = 'iniciado' | 'finalizado' | null;

const NOME_ATENDIMENTO_INICIADO = 'atendimento iniciado';
const NOME_ATENDIMENTO_FINALIZADO = 'atendimento finalizado';

export function normalizarNomeEtiqueta(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function statusAtendimentoDoLead(
  idsEtiquetasDoLead: Set<number> | undefined,
  nomePorIdEtiqueta: Map<number, string>
): StatusAtendimento {
  if (!idsEtiquetasDoLead || idsEtiquetasDoLead.size === 0) return null;

  let iniciado = false;
  let finalizado = false;

  idsEtiquetasDoLead.forEach((id) => {
    const nome = nomePorIdEtiqueta.get(id);
    if (!nome) return;
    const normalizado = normalizarNomeEtiqueta(nome);
    if (normalizado === NOME_ATENDIMENTO_INICIADO) iniciado = true;
    if (normalizado === NOME_ATENDIMENTO_FINALIZADO) finalizado = true;
  });

  // "Finalizado" ganha de "iniciado" se as duas estiverem presentes: o atendimento já acabou.
  if (finalizado) return 'finalizado';
  if (iniciado) return 'iniciado';
  return null;
}
