export interface LeadOperationsClient {
  rpc(
    functionName: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface LeadAiState {
  id: number;
  id_empresa: number;
  bot_ativo: boolean | string;
  bot_ativo_alterado_em: string;
}

export function canDeleteLeadByRole(role: string | null | undefined): boolean {
  return ['admin_master', 'admin'].includes(role ?? '');
}

export function isLeadAiActive(value: boolean | string | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && ['true', '1', 'sim', 'ativo'].includes(value.trim().toLowerCase());
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function singleRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0];
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

export async function deleteLead(
  client: LeadOperationsClient,
  input: { leadId: number; idEmpresa: number }
): Promise<number> {
  if (!isPositiveInteger(input.leadId) || !isPositiveInteger(input.idEmpresa)) {
    throw new Error('Lead inválido.');
  }

  const { data, error } = await client.rpc('excluir_lead_seguro', {
    p_lead_id: input.leadId,
    p_id_empresa: input.idEmpresa,
  });
  const row = singleRow(data);

  if (error || row?.id !== input.leadId || row.id_empresa !== input.idEmpresa) {
    throw new Error('Não foi possível excluir o lead.');
  }

  return input.leadId;
}

export async function setLeadAiStatus(
  client: LeadOperationsClient,
  input: { leadId: number; idEmpresa: number; ativo: boolean }
): Promise<LeadAiState> {
  if (!isPositiveInteger(input.leadId) || !isPositiveInteger(input.idEmpresa)) {
    throw new Error('Lead inválido.');
  }
  if (typeof input.ativo !== 'boolean') throw new Error('Status da IA inválido.');

  const { data, error } = await client.rpc('alterar_status_ia_lead', {
    p_lead_id: input.leadId,
    p_id_empresa: input.idEmpresa,
    p_ativo: input.ativo,
  });
  const row = singleRow(data);
  const timestamp = row?.bot_ativo_alterado_em;

  if (
    error ||
    row?.id !== input.leadId ||
    row.id_empresa !== input.idEmpresa ||
    (typeof row.bot_ativo !== 'boolean' && typeof row.bot_ativo !== 'string') ||
    isLeadAiActive(row.bot_ativo) !== input.ativo ||
    typeof timestamp !== 'string' ||
    !timestamp ||
    Number.isNaN(new Date(timestamp).getTime())
  ) {
    throw new Error('Não foi possível alterar o status da IA.');
  }

  return row as unknown as LeadAiState;
}

export function formatLeadAiChangedAt(value: string | null | undefined): string {
  if (!value) return 'não registrada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'não registrada' : date.toLocaleString('pt-BR');
}
