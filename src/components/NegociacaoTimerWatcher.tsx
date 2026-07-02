'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cargo } from '@/types/database';

// Verifica periodicamente (client-side) se há leads em "em_negociacao" cujo prazo de 30min
// já venceu. Ao detectar um vencimento novo, exibe o popup E chama /api/negociacao/notificar,
// que reivindica a notificação de forma atômica no banco e dispara o webhook do n8n (que envia
// o WhatsApp ao vendedor). Isso evita que múltiplos navegadores disparem o webhook duplicado.

interface LeadVencido {
  id: number;
  nome_lead: string;
  vendedor: string | null;
  negociacao_expira_em: string;
  negociacao_extensoes: number;
}

const INTERVALO_VERIFICACAO_MS = 20_000;

interface NegociacaoTimerWatcherProps {
  userCargo: Cargo;
}

export function NegociacaoTimerWatcher({ userCargo }: NegociacaoTimerWatcherProps) {
  const [leadVencido, setLeadVencido] = useState<LeadVencido | null>(null);
  const [estendendo, setEstendendo] = useState(false);
  const [ignorados, setIgnorados] = useState<Set<number>>(new Set());

  const podeEstender = userCargo === 'admin_master' || userCargo === 'admin' || userCargo === 'gerente';

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function verificar() {
      const { data, error } = await supabase
        .from('BASE_DE_LEADS')
        .select('id, nome_lead, vendedor, negociacao_expira_em, negociacao_extensoes')
        .eq('estagio_lead', 'em_negociacao')
        .not('negociacao_expira_em', 'is', null)
        .lte('negociacao_expira_em', new Date().toISOString())
        .order('negociacao_expira_em', { ascending: true });

      if (!isMounted || error || !data) return;

      // RLS já garante que vendedor só recebe aqui os próprios leads.
      const candidatos = (data as unknown as LeadVencido[]).filter((l) => !ignorados.has(l.id));

      if (candidatos.length > 0) {
        setLeadVencido((atual) => atual ?? candidatos[0]);

        // Fire-and-forget: reivindica a notificação (idempotente no servidor) para cada
        // lead vencido detectado, mesmo os que não estão sendo exibidos no popup ainda.
        candidatos.forEach((lead) => {
          fetch('/api/negociacao/notificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: lead.id }),
          }).catch(() => {});
        });
      }
    }

    verificar();
    const intervalo = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    return () => {
      isMounted = false;
      clearInterval(intervalo);
    };
  }, [ignorados]);

  function fechar() {
    if (leadVencido) {
      setIgnorados((prev) => new Set(prev).add(leadVencido.id));
    }
    setLeadVencido(null);
  }

  async function estenderPrazo() {
    if (!leadVencido) return;
    setEstendendo(true);
    const supabase = createClient();
    const novoPrazo = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('BASE_DE_LEADS')
      .update({
        negociacao_expira_em: novoPrazo,
        negociacao_notificado_em: null,
        negociacao_extensoes: leadVencido.negociacao_extensoes + 1,
      })
      .eq('id', leadVencido.id);

    setEstendendo(false);
    if (!error) {
      setIgnorados((prev) => new Set(prev).add(leadVencido.id));
      setLeadVencido(null);
    }
  }

  if (!leadVencido) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-bold text-foreground">Tempo de negociação esgotado</h2>
        <p className="mt-2 text-sm text-gray-600">
          O lead <span className="font-medium">{leadVencido.nome_lead}</span>
          {leadVencido.vendedor && (
            <>
              {' '}
              (vendedor <span className="font-medium">{leadVencido.vendedor}</span>)
            </>
          )}{' '}
          está em negociação há mais de 30 minutos.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={fechar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Fechar
          </button>
          {podeEstender && (
            <button
              onClick={estenderPrazo}
              disabled={estendendo}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {estendendo ? 'Estendendo...' : 'Estender +30min'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
