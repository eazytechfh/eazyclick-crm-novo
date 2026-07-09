'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BaseDeLeads, Etiqueta, LeadHistoricoEstagio, Vendedor } from '@/types/database';
import { Avatar } from '@/components/Avatar';
import { isDentroExpediente } from '@/lib/expediente';

function calcularIdade(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

function classificacaoSerasa(score: number | null): { label: string; color: string } {
  if (score === null) return { label: 'Sem dados', color: '#9ca3af' };
  if (score < 300) return { label: 'Ruim', color: '#ef4444' };
  if (score < 500) return { label: 'Regular', color: '#f59e0b' };
  if (score < 700) return { label: 'Bom', color: '#3b82f6' };
  return { label: 'Excelente', color: '#22c55e' };
}

function telefoneParaWhatsapp(telefone: string | null | undefined): string | null {
  const numero = telefone?.replace(/\D/g, '') ?? '';
  return numero ? `https://wa.me/${numero}` : null;
}

interface LeadDrawerProps {
  lead: BaseDeLeads;
  estagioLabel: string;
  estagioColor: string;
  estagioLabelOf: (estagio: string) => string;
  onClose: () => void;
  onUpdated: (lead: BaseDeLeads) => void;
}

export function LeadDrawer({
  lead,
  estagioLabel,
  estagioColor,
  estagioLabelOf,
  onClose,
  onUpdated,
}: LeadDrawerProps) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiquetasDoLead, setEtiquetasDoLead] = useState<Set<number>>(new Set());
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [historico, setHistorico] = useState<LeadHistoricoEstagio[]>([]);

  const [observacao, setObservacao] = useState(lead.observacao_vendedor ?? '');
  const [salvandoObservacao, setSalvandoObservacao] = useState(false);

  const [campos, setCampos] = useState({
    nome_lead: lead.nome_lead ?? '',
    cpf: lead.cpf ?? '',
    data_nascimento: lead.data_nascimento ?? '',
    veiculo_interesse: lead.veiculo_interesse ?? '',
    valor: lead.valor !== null ? String(lead.valor) : '',
    vendedor: lead.vendedor ?? '',
  });
  const [salvandoCampos, setSalvandoCampos] = useState(false);
  const [mensagemCampos, setMensagemCampos] = useState<string | null>(null);

  useEffect(() => {
    setObservacao(lead.observacao_vendedor ?? '');
    setCampos({
      nome_lead: lead.nome_lead ?? '',
      cpf: lead.cpf ?? '',
      data_nascimento: lead.data_nascimento ?? '',
      veiculo_interesse: lead.veiculo_interesse ?? '',
      valor: lead.valor !== null ? String(lead.valor) : '',
      vendedor: lead.vendedor ?? '',
    });
  }, [lead.id, lead.nome_lead, lead.observacao_vendedor, lead.cpf, lead.data_nascimento, lead.veiculo_interesse, lead.valor, lead.vendedor]);

  useEffect(() => {
    let isMounted = true;
    async function fetchDados() {
      const supabase = createClient();
      const [{ data: todasEtiquetas }, { data: doLead }, { data: vendedoresData }, { data: historicoData }] =
        await Promise.all([
          supabase.from('etiquetas').select('id, nome, cor, created_at').order('nome'),
          supabase.from('lead_etiquetas').select('id_etiqueta').eq('id_lead', lead.id),
          supabase.from('VENDEDORES').select('id, created_at, vendedor, telefone, atender, quantos_lead, id_click, id_empresa').order('vendedor'),
          supabase
            .from('lead_historico_estagio')
            .select('id, id_lead, estagio_anterior, estagio_novo, usuario, created_at')
            .eq('id_lead', lead.id)
            .order('created_at', { ascending: false }),
        ]);
      if (!isMounted) return;
      setEtiquetas((todasEtiquetas as Etiqueta[]) ?? []);
      setEtiquetasDoLead(new Set(((doLead as { id_etiqueta: number }[]) ?? []).map((e) => e.id_etiqueta)));
      setVendedores((vendedoresData as Vendedor[]) ?? []);
      setHistorico((historicoData as LeadHistoricoEstagio[]) ?? []);
    }
    fetchDados();
    return () => {
      isMounted = false;
    };
  }, [lead.id]);

  async function toggleEtiqueta(idEtiqueta: number) {
    const supabase = createClient();
    const jaTem = etiquetasDoLead.has(idEtiqueta);

    setEtiquetasDoLead((prev) => {
      const next = new Set(prev);
      if (jaTem) next.delete(idEtiqueta);
      else next.add(idEtiqueta);
      return next;
    });

    if (jaTem) {
      await supabase
        .from('lead_etiquetas')
        .delete()
        .eq('id_lead', lead.id)
        .eq('id_etiqueta', idEtiqueta);
    } else {
      await supabase.from('lead_etiquetas').insert({ id_lead: lead.id, id_etiqueta: idEtiqueta });
    }

    window.dispatchEvent(new CustomEvent('lead-etiquetas-updated', { detail: { leadId: lead.id } }));
  }

  async function salvarObservacao() {
    setSalvandoObservacao(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('BASE_DE_LEADS')
      .update({ observacao_vendedor: observacao })
      .eq('id', lead.id);
    setSalvandoObservacao(false);
    if (!error) onUpdated({ ...lead, observacao_vendedor: observacao });
  }

  async function salvarCampos() {
    setSalvandoCampos(true);
    setMensagemCampos(null);
    const supabase = createClient();

    const valorNumerico = campos.valor ? Number(campos.valor.replace(',', '.')) : 0;

    const { error } = await supabase
      .from('BASE_DE_LEADS')
      .update({
        nome_lead: campos.nome_lead.trim(),
        cpf: campos.cpf || null,
        data_nascimento: campos.data_nascimento || null,
        veiculo_interesse: campos.veiculo_interesse || null,
        valor: valorNumerico,
        vendedor: campos.vendedor || null,
      })
      .eq('id', lead.id);

    setSalvandoCampos(false);

    if (error) {
      setMensagemCampos('Erro ao salvar alterações.');
      return;
    }

    setMensagemCampos('Alterações salvas.');
    onUpdated({
      ...lead,
      nome_lead: campos.nome_lead.trim(),
      cpf: campos.cpf || null,
      data_nascimento: campos.data_nascimento || null,
      veiculo_interesse: campos.veiculo_interesse || null,
      valor: valorNumerico,
      vendedor: campos.vendedor || null,
    });
    setTimeout(() => setMensagemCampos(null), 3000);
  }

  const idade = calcularIdade(campos.data_nascimento || null);
  const serasa = classificacaoSerasa(lead.score_serasa);
  const dentroExpediente = isDentroExpediente(new Date(lead.created_at));
  const whatsappUrl = telefoneParaWhatsapp(lead.telefone);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <Avatar name={lead.nome_lead} size={44} />
            <div>
              <p className="text-base font-semibold text-foreground">{lead.nome_lead}</p>
              <p className="text-sm text-gray-500">{lead.telefone}</p>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  Abrir WhatsApp
                </a>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${estagioColor}1a`, color: estagioColor }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: estagioColor }} />
                  {estagioLabel}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    dentroExpediente ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${dentroExpediente ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  {dentroExpediente ? 'Dentro do expediente' : 'Fora do expediente'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 p-5">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Dados Pessoais
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-gray-500">Nome</label>
                <input
                  value={campos.nome_lead}
                  onChange={(e) => setCampos((c) => ({ ...c, nome_lead: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">CPF</label>
                <input
                  value={campos.cpf}
                  onChange={(e) => setCampos((c) => ({ ...c, cpf: e.target.value }))}
                  placeholder="000.000.000-00"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Data de nascimento</label>
                <input
                  type="date"
                  value={campos.data_nascimento}
                  onChange={(e) => setCampos((c) => ({ ...c, data_nascimento: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500">Idade</p>
                <p className="text-sm font-medium text-foreground">{idade !== null ? `${idade} anos` : '—'}</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Score Serasa
            </h3>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-foreground">{lead.score_serasa ?? '—'}</p>
              <span
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: `${serasa.color}1a`, color: serasa.color }}
              >
                {serasa.label}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ((lead.score_serasa ?? 0) / 1000) * 100)}%`,
                  backgroundColor: serasa.color,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>0</span>
              <span>1000</span>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Negociação
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Veículo de interesse</label>
                <input
                  value={campos.veiculo_interesse}
                  onChange={(e) => setCampos((c) => ({ ...c, veiculo_interesse: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={campos.valor}
                  onChange={(e) => setCampos((c) => ({ ...c, valor: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Vendedor</label>
                <select
                  value={campos.vendedor}
                  onChange={(e) => setCampos((c) => ({ ...c, vendedor: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Sem vendedor</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.vendedor ?? ''}>
                      {v.vendedor}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500">Origem</p>
                <p className="text-sm font-medium text-foreground">{lead.origem ?? '—'}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={salvarCampos}
              disabled={salvandoCampos}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {salvandoCampos ? 'Salvando...' : 'Salvar alterações'}
            </button>
            {mensagemCampos && <p className="mt-2 text-xs text-gray-500">{mensagemCampos}</p>}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Etiquetas
            </h3>
            <div className="flex flex-wrap gap-2">
              {etiquetas.map((etiqueta) => {
                const ativa = etiquetasDoLead.has(etiqueta.id);
                return (
                  <button
                    key={etiqueta.id}
                    type="button"
                    onClick={() => toggleEtiqueta(etiqueta.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={
                      ativa
                        ? { backgroundColor: `${etiqueta.cor}1a`, borderColor: etiqueta.cor, color: etiqueta.cor }
                        : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                    }
                  >
                    {etiqueta.nome}
                  </button>
                );
              })}
              {etiquetas.length === 0 && (
                <p className="text-xs text-gray-400">Nenhuma etiqueta cadastrada.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Resumo de qualificação [IA]
            </h3>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
              {lead.resumo_qualificacao?.trim() || (
                <span className="text-gray-400">Nenhum resumo de qualificação disponível ainda.</span>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Observações
            </h3>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Anote observações sobre este lead..."
            />
            <button
              type="button"
              onClick={salvarObservacao}
              disabled={salvandoObservacao}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {salvandoObservacao ? 'Salvando...' : 'Salvar observação'}
            </button>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Histórico de Movimentações
            </h3>
            {historico.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma movimentação registrada ainda.</p>
            ) : (
              <ul className="space-y-2">
                {historico.map((item) => (
                  <li key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-800">
                        {item.estagio_anterior ? `${estagioLabelOf(item.estagio_anterior)} → ` : ''}
                        {estagioLabelOf(item.estagio_novo)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{item.usuario ?? 'Usuário desconhecido'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
