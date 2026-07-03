import { PillFilter } from '@/components/PillFilter';
import {
  EXPEDIENTE_OPTIONS,
  PERIODO_OPTIONS,
  type LeadFiltersState,
} from '@/hooks/useLeadFilters';

interface LeadFiltersBarProps {
  filters: LeadFiltersState;
}

export function LeadFiltersBar({ filters }: LeadFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 shadow-sm">
      <input
        type="text"
        placeholder="Buscar por nome, telefone ou e-mail..."
        value={filters.busca}
        onChange={(e) => filters.setBusca(e.target.value)}
        className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <select
        value={filters.origemFiltro}
        onChange={(e) => filters.setOrigemFiltro(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="todas">Todas as origens</option>
        {filters.origensDisponiveis.map((origem) => (
          <option key={origem} value={origem}>
            {origem}
          </option>
        ))}
      </select>

      <select
        value={filters.vendedorFiltro}
        onChange={(e) => filters.setVendedorFiltro(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="todos">Todos os vendedores</option>
        {filters.vendedoresDisponiveis.map((vendedor) => (
          <option key={vendedor} value={vendedor}>
            {vendedor}
          </option>
        ))}
      </select>

      <select
        value={filters.veiculoFiltro}
        onChange={(e) => filters.setVeiculoFiltro(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="todos">Todos os veículos</option>
        {filters.veiculosDisponiveis.map((veiculo) => (
          <option key={veiculo} value={veiculo}>
            {veiculo}
          </option>
        ))}
      </select>

      <PillFilter options={PERIODO_OPTIONS} selected={filters.periodo} onChange={filters.setPeriodo} />
      <PillFilter
        options={EXPEDIENTE_OPTIONS}
        selected={filters.expediente}
        onChange={filters.setExpediente}
      />

      <button
        type="button"
        onClick={filters.limparFiltros}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        Limpar filtros
      </button>
    </div>
  );
}
