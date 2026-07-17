const TAMANHO_PAGINA = 1000;

export type LeadIdentificavel = {
  id: number;
  telefone: string | null;
  email: string | null;
};

type ErroSupabase = { message: string } | null;

type SupabaseLeadsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean }
      ) => {
        range: (
          inicio: number,
          fim: number
        ) => PromiseLike<{ data: unknown[] | null; error: ErroSupabase }>;
      };
    };
  };
};

function chaveDoLead(lead: LeadIdentificavel): string {
  let telefone = (lead.telefone ?? '').replace(/\D/g, '');
  if (telefone.startsWith('55') && (telefone.length === 12 || telefone.length === 13)) {
    telefone = telefone.slice(2);
  }
  if (telefone) return `telefone:${telefone}`;

  const email = (lead.email ?? '').trim().toLowerCase();
  if (email) return `email:${email}`;

  return `id:${lead.id}`;
}

export function deduplicarLeads<T extends LeadIdentificavel>(leads: T[]): {
  leads: T[];
  duplicadosRemovidos: number;
} {
  const chaves = new Set<string>();
  const unicos: T[] = [];

  for (const lead of leads) {
    const chave = chaveDoLead(lead);
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    unicos.push(lead);
  }

  return {
    leads: unicos,
    duplicadosRemovidos: leads.length - unicos.length,
  };
}

export async function carregarTodosLeads<T extends LeadIdentificavel>(
  supabase: SupabaseLeadsClient,
  select: string
): Promise<{ leads: T[]; duplicadosRemovidos: number; error: Error | null }> {
  const todos: T[] = [];

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('BASE_DE_LEADS')
      .select(select)
      .order('created_at', { ascending: false })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);

    if (error) {
      return { leads: [], duplicadosRemovidos: 0, error: new Error(error.message) };
    }

    const pagina = (data ?? []) as T[];
    todos.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }

  return { ...deduplicarLeads(todos), error: null };
}
