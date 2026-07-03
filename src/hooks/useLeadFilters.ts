import { useMemo, useState } from 'react';
import type { BaseDeLeads } from '@/types/database';
import { isDentroExpediente } from '@/lib/expediente';
import type { PillOption } from '@/components/PillFilter';

export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'todos';
export type Expediente = 'todos' | 'dentro' | 'fora';

export const PERIODO_OPTIONS: PillOption<Periodo>[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'todos', label: 'Todos' },
];

export const EXPEDIENTE_OPTIONS: PillOption<Expediente>[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'dentro', label: 'Dentro do expediente' },
  { value: 'fora', label: 'Fora do expediente' },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useLeadFilters(leads: BaseDeLeads[]) {
  const [busca, setBusca] = useState('');
  const [origemFiltro, setOrigemFiltro] = useState('todas');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');
  const [veiculoFiltro, setVeiculoFiltro] = useState('todos');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [expediente, setExpediente] = useState<Expediente>('todos');

  const origensDisponiveis = useMemo(
    () => Array.from(new Set(leads.map((l) => l.origem).filter((v): v is string => Boolean(v)))),
    [leads]
  );

  const vendedoresDisponiveis = useMemo(
    () => Array.from(new Set(leads.map((l) => l.vendedor).filter((v): v is string => Boolean(v)))),
    [leads]
  );

  const veiculosDisponiveis = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.veiculo_interesse).filter((v): v is string => Boolean(v)))),
    [leads]
  );

  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      if (busca) {
        const term = busca.toLowerCase();
        const matches =
          lead.nome_lead?.toLowerCase().includes(term) ||
          lead.telefone?.toLowerCase().includes(term) ||
          lead.email?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (origemFiltro !== 'todas' && lead.origem !== origemFiltro) return false;
      if (vendedorFiltro !== 'todos' && lead.vendedor !== vendedorFiltro) return false;
      if (veiculoFiltro !== 'todos' && lead.veiculo_interesse !== veiculoFiltro) return false;

      if (periodo !== 'todos') {
        const created = new Date(lead.created_at);
        const limites: Record<Exclude<Periodo, 'todos'>, Date> = {
          hoje: daysAgo(0),
          ontem: daysAgo(1),
          '7d': daysAgo(7),
          '30d': daysAgo(30),
          '90d': daysAgo(90),
        };

        if (periodo === 'ontem') {
          const inicioOntem = daysAgo(1);
          const fimOntem = daysAgo(0);
          if (!(created >= inicioOntem && created < fimOntem)) return false;
        } else if (created < limites[periodo]) {
          return false;
        }
      }

      if (expediente !== 'todos') {
        const dentro = isDentroExpediente(new Date(lead.created_at));
        if (expediente === 'dentro' && !dentro) return false;
        if (expediente === 'fora' && dentro) return false;
      }

      return true;
    });
  }, [leads, busca, origemFiltro, vendedorFiltro, veiculoFiltro, periodo, expediente]);

  function limparFiltros() {
    setBusca('');
    setOrigemFiltro('todas');
    setVendedorFiltro('todos');
    setVeiculoFiltro('todos');
    setPeriodo('todos');
    setExpediente('todos');
  }

  return {
    busca,
    setBusca,
    origemFiltro,
    setOrigemFiltro,
    vendedorFiltro,
    setVendedorFiltro,
    veiculoFiltro,
    setVeiculoFiltro,
    periodo,
    setPeriodo,
    expediente,
    setExpediente,
    origensDisponiveis,
    vendedoresDisponiveis,
    veiculosDisponiveis,
    leadsFiltrados,
    limparFiltros,
  };
}

export type LeadFiltersState = ReturnType<typeof useLeadFilters>;
