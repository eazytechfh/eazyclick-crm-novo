'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import type { BaseDeLeads } from '@/types/database';
import { Avatar } from '@/components/Avatar';
import { StatusBadge } from '@/components/StatusBadge';
import { PillFilter, type PillOption } from '@/components/PillFilter';
import { isDentroExpediente } from '@/lib/expediente';

type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'todos';
type Expediente = 'todos' | 'dentro' | 'fora';

const PERIODO_OPTIONS: PillOption<Periodo>[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'todos', label: 'Todos' },
];

const EXPEDIENTE_OPTIONS: PillOption<Expediente>[] = [
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

const ORIGEM_DOT_COLORS: Record<string, string> = {
  whatsapp: '#22c55e',
  instagram: '#a855f7',
  facebook: '#3b82f6',
  site: '#38bdf8',
  indicacao: '#f97316',
};

function getOrigemColor(origem: string | null): string {
  if (!origem) return '#6b7280';
  return ORIGEM_DOT_COLORS[origem.toLowerCase()] ?? '#6b7280';
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<BaseDeLeads[]>([]);
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState('');
  const [origemFiltro, setOrigemFiltro] = useState('todas');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');
  const [veiculoFiltro, setVeiculoFiltro] = useState('todos');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [expediente, setExpediente] = useState<Expediente>('todos');

  useEffect(() => {
    let isMounted = true;

    async function fetchLeads() {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('BASE_DE_LEADS')
        .select(
          'id, id_empresa, nome_lead, telefone, email, origem, vendedor, veiculo_interesse, resumo_qualificacao, estagio_lead, resumo_comercial, created_at, updated_at, valor, observacao_vendedor, bot_ativo, "Etapa", "QuemEnviouMsg", "UltimaMensagem", StatusDeFollow:"Status de Follow", "Transferencia", PesquisaDeSatisfacao:"Pesquisa de satisfação", IdContatoClick:"ID CONTATO CLICK", lid, DataEHora:"Data e Hora"'
        )
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error('Erro ao buscar leads:', error.message);
        setLeads([]);
      } else {
        setLeads((data as unknown as BaseDeLeads[]) ?? []);
      }
      setLoading(false);
    }

    fetchLeads();
    return () => {
      isMounted = false;
    };
  }, []);

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

  function exportarCsv() {
    const headers = ['Nome', 'Telefone', 'Email', 'Origem', 'Vendedor', 'Veículo', 'Estágio', 'Valor', 'Criado em'];
    const rows = leadsFiltrados.map((l) => [
      l.nome_lead,
      l.telefone,
      l.email ?? '',
      l.origem ?? '',
      l.vendedor ?? '',
      l.veiculo_interesse ?? '',
      l.estagio_lead,
      l.valor ?? '',
      l.created_at,
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
    []
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 64;

  const rowVirtualizer = useVirtualizer({
    count: leadsFiltrados.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-gray-500">{leadsFiltrados.length} lead(s) encontrado(s)</p>
        </div>
        <button
          type="button"
          onClick={exportarCsv}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 shadow-sm">
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />

        <select
          value={origemFiltro}
          onChange={(e) => setOrigemFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todas">Todas as origens</option>
          {origensDisponiveis.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={vendedorFiltro}
          onChange={(e) => setVendedorFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos os vendedores</option>
          {vendedoresDisponiveis.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={veiculoFiltro}
          onChange={(e) => setVeiculoFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos os veículos</option>
          {veiculosDisponiveis.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <PillFilter options={PERIODO_OPTIONS} selected={periodo} onChange={setPeriodo} />
        <PillFilter options={EXPEDIENTE_OPTIONS} selected={expediente} onChange={setExpediente} />

        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Limpar filtros
        </button>
      </div>

      <div className="rounded-xl bg-card shadow-sm">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
          <span>Lead</span>
          <span>Origem</span>
          <span>Vendedor</span>
          <span>Veículo</span>
          <span>Estágio</span>
          <span>Valor</span>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-500">Carregando...</p>
        ) : leadsFiltrados.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">Nenhum lead encontrado.</p>
        ) : (
          <div ref={parentRef} className="max-h-[600px] overflow-y-auto">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const lead = leadsFiltrados[virtualRow.index];
                return (
                  <div
                    key={lead.id}
                    className="absolute left-0 top-0 grid w-full grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.8fr] items-center gap-2 border-b border-gray-100 px-4"
                    style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Avatar name={lead.nome_lead} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{lead.nome_lead}</p>
                        <p className="truncate text-xs text-gray-500">
                          {lead.telefone} ·{' '}
                          {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getOrigemColor(lead.origem) }}
                      />
                      {lead.origem ?? '—'}
                    </div>
                    <span className="truncate text-sm text-gray-700">{lead.vendedor ?? '—'}</span>
                    <span className="truncate text-sm text-gray-700">{lead.veiculo_interesse ?? '—'}</span>
                    <StatusBadge estagio={lead.estagio_lead} />
                    <span className="text-sm font-medium text-foreground">
                      {lead.valor != null ? currencyFormatter.format(lead.valor) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
