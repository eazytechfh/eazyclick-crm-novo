'use client';

import { LeadDrawer } from '@/components/LeadDrawer';
import type { BaseDeLeads, PipelineEtapa } from '@/types/database';

interface ConversationLeadDrawerProps {
  lead: BaseDeLeads;
  etapas: PipelineEtapa[];
  onClose: () => void;
  onUpdated: (lead: BaseDeLeads) => void;
  onDeleted: (leadId: number) => void;
  /** Mantido na assinatura por compatibilidade com o chamador; o LeadDrawer deste projeto
   * decide a permissão de exclusão internamente, então o valor não é repassado. */
  canDeleteLead?: boolean;
}

// Recebe `etapas` por prop (já carregadas pelo ConversasClient pai para o filtro de estágio da
// lista) em vez de buscar de novo aqui.
export function ConversationLeadDrawer({ lead, etapas, onClose, onUpdated, onDeleted }: ConversationLeadDrawerProps) {
  function estagioLabelOf(estagio: string): string {
    return etapas.find((etapa) => etapa.slug === estagio)?.nome ?? estagio ?? 'Oportunidade';
  }
  const etapaAtual = etapas.find((etapa) => etapa.slug === lead.estagio_lead);

  return (
    <LeadDrawer
      lead={lead}
      estagioLabel={etapaAtual?.nome ?? 'Oportunidade'}
      estagioColor={etapaAtual?.cor ?? '#22c55e'}
      estagioLabelOf={estagioLabelOf}
      onClose={onClose}
      onUpdated={onUpdated}
      onDeleted={onDeleted}
    />
  );
}
